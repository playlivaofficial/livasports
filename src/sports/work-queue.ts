/** Wait for in-flight commits before surfacing an error; never leave detached writes running. */
export async function runSportsJobs<T>(items:readonly T[],concurrency:number,work:(item:T)=>Promise<void>){
  let next=0;let failed=false;let failure:unknown;
  const worker=async()=>{
    while(!failed){const index=next++;if(index>=items.length)return;
      try{await work(items[index]);}catch(error){if(!failed){failure=error;failed=true;}}
    }
  };
  await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,concurrency))},worker));
  if(failed)throw failure;
}
