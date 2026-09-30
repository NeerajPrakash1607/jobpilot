// PDF drawing order can put right-aligned dates before the role on the same line.
// Reconstruct the visible reading order using text coordinates.
export function textFromItems(items){
  const lines=[];
  for(const item of items){
    if(!item.str?.trim()||!item.transform)continue;
    const y=item.transform[5],x=item.transform[4];let line=lines.find(line=>Math.abs(line.y-y)<=3);
    if(!line){line={y,items:[]};lines.push(line);}line.items.push({x,text:item.str});
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ').replace(/\s+/g,' ').trim()).join('\n');
}
import {resumeLayout} from '../resume-layout.js';
export async function readResume(bytes){
  const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
  try{
    const document=await task.promise;
    if(document.numPages>40)throw new Error('Choose a résumé with at most 40 pages.');
    const pages=[];
    for(let number=1;number<=document.numPages;number++){
      const page=await document.getPage(number),content=await page.getTextContent();
      pages.push(textFromItems(content.items));page.cleanup();
    }
    return pages.join('\n\n').trim();
  }finally{await task.destroy();}
}
export async function exportResume(text,format){
  if(format==='txt')return new Blob([text],{type:'text/plain;charset=utf-8'});
  if(format==='docx')return word(resumeLayout(text));
  if(format==='pdf')return pdf(resumeLayout(text));
  throw new Error('Choose PDF, Word or plain text.');
}
async function word(blocks){
  const {Document,Paragraph,TextRun,Packer,AlignmentType,BorderStyle,TabStopType,ExternalHyperlink,LevelFormat}=await import('docx');
  const run=(text,bold=false,size=20)=>new TextRun({text,bold,size,font:'Charter',color:'000000'});
  const children=blocks.flatMap((block,index)=>{
    const common={spacing:{before:0,after:40,line:240},widowControl:true,keepLines:true};
    if(block.kind==='name')return new Paragraph({...common,alignment:AlignmentType.CENTER,keepNext:true,spacing:{after:120,line:600,lineRule:'exact'},children:[run(block.text,false,50)]});
    if(block.kind==='contacts')return block.rows.filter(row=>row.length).map(row=>new Paragraph({...common,alignment:AlignmentType.CENTER,keepNext:true,children:row.flatMap((part,i)=>[...(i?[run(' | ',false,19)]:[]),part.href?new ExternalHyperlink({link:part.href,children:[run(part.text,false,19)]}):run(part.text,false,19)])}));
    if(block.kind==='section')return new Paragraph({...common,heading:'Heading1',keepNext:true,spacing:{before:200,after:80,line:300},border:{bottom:{style:BorderStyle.SINGLE,size:3,color:'000000',space:3}},children:[run(block.text,true,24)]});
    if(block.kind==='entry')return new Paragraph({...common,keepNext:true,tabStops:[{type:TabStopType.RIGHT,position:10012}],children:[run(block.emphasis||'',true),run(block.text.slice((block.emphasis||'').length)),...(block.date?[run('\t'+block.date)]:[])]});
    const shortNext=block.kind==='bullet'&&blocks[index+1]?.kind==='bullet'&&blocks[index+2]?.kind!=='bullet';
    return new Paragraph({...common,keepNext:shortNext,spacing:{...common.spacing,after:block.kind==='skill'?0:40},...(block.kind==='bullet'?{numbering:{reference:'bullets',level:0}}:{}),children:[run(block.text)]});
  });
  const document=new Document({creator:'JobPilot',styles:{default:{document:{run:{font:'Charter',size:20,color:'000000'},paragraph:{spacing:{line:240}}}}},numbering:{config:[{reference:'bullets',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:220,hanging:220}}}}]}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1060,bottom:1114,left:1114,right:1114}}},children}]});
  return Packer.toBlob(document);
}
async function pdf(blocks){
  const [{PDFDocument,PDFString,rgb},fontkitModule]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
  const doc=await PDFDocument.create();doc.registerFontkit(fontkitModule.default);
  const fontData=await Promise.all(['/assets/fonts/Charter-Regular.ttf','/assets/fonts/Charter-Bold.ttf'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('The résumé font could not load. Try again.');return r.arrayBuffer();}));
  const [regular,bold]=await Promise.all(fontData.map(data=>doc.embedFont(data,{subset:true})));
  const supported=new Set(regular.getCharacterSet());
  for(const block of blocks)for(const char of block.text||'')if(!/\s/.test(char)&&!supported.has(char.codePointAt(0)))throw new Error('This PDF font does not cover every character in your résumé. Download Word to preserve your original text.');
  const left=55.7,right=556.3,width=right-left,bottom=55.7;let page,y;
  function newPage(){page=doc.addPage([612,792]);y=739;}
  function need(height){if(y-height<bottom)newPage();}
  function wrap(runs,size,limit){
    const lines=[[]];let used=0;
    for(const run of runs){const font=run.bold?bold:regular;
      for(const token of run.text.match(/\S+\s*|\s+/g)||[]){
        const chunks=font.widthOfTextAtSize(token.trim(),size)>limit?[...token]:[token];
        for(let piece of chunks){let w=font.widthOfTextAtSize(piece,size);if(used+w>limit&&lines.at(-1).length){lines.push([]);used=0;piece=piece.trimStart();w=font.widthOfTextAtSize(piece,size);}if(!piece)continue;lines.at(-1).push({text:piece,font,width:w});used+=w;}
      }
    }
    return lines;
  }
  function drawLine(line,x,size){for(const run of line){page.drawText(run.text,{x,y:y-size,font:run.font,size,color:rgb(0,0,0)});x+=run.width;}}
  function paragraph(runs,{size=10,lineHeight=12,indent=0,center=false,after=2,keep=0}={}){
    const lines=wrap(runs,size,width-indent);need(Math.min(lines.length*lineHeight+keep,150));
    for(const line of lines){need(lineHeight);const total=line.reduce((n,r)=>n+r.width,0);drawLine(line,center?left+(width-total)/2:left+indent,size);y-=lineHeight;}y-=after;
  }
  newPage();
  for(let i=0;i<blocks.length;i++){
    const block=blocks[i];
    if(block.kind==='name'){paragraph([{text:block.text}],{size:24.9,lineHeight:30,center:true,after:6,keep:32});continue;}
    if(block.kind==='contacts'){
      for(const row of block.rows.filter(row=>row.length)){
        const full=row.map(part=>part.text).join(' | '),total=regular.widthOfTextAtSize(full,9.5);need(12);let x=left+(width-total)/2;
        if(total>width){paragraph([{text:full}],{size:9.5,lineHeight:12,center:true});continue;}
        for(let k=0;k<row.length;k++){
          const part=row[k],w=regular.widthOfTextAtSize(part.text,9.5);page.drawText(part.text,{x,y:y-9.5,font:regular,size:9.5});
          if(part.href){const link=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y-12,x+w,y+1],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(part.href)}}));page.node.addAnnot(link);}
          x+=w;if(k<row.length-1){page.drawText(' | ',{x,y:y-9.5,font:regular,size:9.5});x+=regular.widthOfTextAtSize(' | ',9.5);}
        }y-=12;
      }y-=6;continue;
    }
    if(block.kind==='section'){need(52);y-=9;paragraph([{text:block.text,bold:true}],{size:12,lineHeight:15,after:0,keep:28});page.drawLine({start:{x:left,y:y-2},end:{x:right,y:y-2},thickness:.4});y-=7;continue;}
    if(block.kind==='entry'){
      const dateWidth=block.date?regular.widthOfTextAtSize(block.date,10):0;
      const lines=wrap([{text:block.emphasis||'',bold:true},{text:block.text.slice((block.emphasis||'').length)}],10,width-(block.date?dateWidth+12:0));
      need(Math.min(lines.length*12+16,150));y-=3;
      if(block.date)page.drawText(block.date,{x:right-dateWidth,y:y-10,font:regular,size:10});
      for(const line of lines){need(12);drawLine(line,left,10);y-=12;}y-=2;continue;
    }
    if(block.kind==='bullet'){need(24);page.drawText('•',{x:left,y:y-10,font:regular,size:10});paragraph([{text:block.text}],{indent:11});}
    else paragraph([{text:block.text}],{after:block.kind==='skill'?0:2});
  }
  return new Blob([await doc.save()],{type:'application/pdf'});
}
