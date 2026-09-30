import {createRemoteJWKSet,jwtVerify} from 'jose';
import {AppError} from './domain.mjs';

const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
export async function hashToken(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');}
export function cookie(request,name){return request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
export function setCookie(request,name,value,maxAge){const secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;}
export async function googleIdentity(credential,audience,nonce){
 if(!audience)throw new AppError('Google sign-in is still being connected.',503);
 if(!/^[a-f0-9]{64}$/.test(nonce))throw new AppError('Start Google sign-in again.',401);
 let payload;
 try{({payload}=await jwtVerify(credential,keys,{audience,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256'],maxTokenAge:'10m'}));}
 catch{throw new AppError('Google sign-in could not be verified. Please try again.',401);}
 if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.sub!=='string'||typeof payload.email!=='string')throw new AppError('A verified Google email is required.',401);
 return {id:'google:'+payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,150):payload.email};
}
export async function unsubscribeToken(secret,account){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(account.id+':'+account.createdAt)));
 return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
export async function requireRunner(request,secret){
 if(!secret||secret.length<32)throw new AppError('Background checks are not configured.',503);
 const supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(await hashToken(supplied)!==await hashToken(secret))throw new AppError('Not authorised.',401);
}
