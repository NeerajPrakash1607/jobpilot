import {createStore,emptyWorkspace} from './browser-store.mjs';
let database;
function open(){
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('jobpilot-public-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Browser storage is unavailable. Allow site storage to use JobPilot.'));
  });
  return database;
}
// One transaction protects profile changes and submission-attempt markers across tabs.
export async function withWorkspace(action){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('workspace','readwrite'),table=transaction.objectStore('workspace');let result,failure;
    const request=table.get('current');
    request.onsuccess=()=>{
      try{const data=request.result||emptyWorkspace();result=action(createStore(data));if(result instanceof Promise)throw new Error('Workspace operations must be synchronous.');table.put(data,'current');}
      catch(error){failure=error;transaction.abort();}
    };
    transaction.oncomplete=()=>resolve(result);
    transaction.onabort=()=>reject(failure||new Error('The workspace could not be saved. Check available browser storage and download a backup.'));
    transaction.onerror=()=>{failure ||= transaction.error;};
  });
}
