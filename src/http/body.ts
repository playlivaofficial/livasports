/** Shared bounded parser; authentication and analytics do not import the retired slip runtime. */
export async function boundedJson(request:Request,limit=4096):Promise<unknown>{
  const reader=request.body?.getReader();if(!reader)return null;
  const decoder=new TextDecoder();let size=0,text='';
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
    if(size>limit){await reader.cancel();throw new Error('BODY_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  }finally{reader.releaseLock();}
}
