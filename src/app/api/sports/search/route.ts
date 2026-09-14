import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {isInterfaceLocale} from '@/localization/interface';
import {sportsQuery} from '@/sports/policy';
import {SportsRepository} from '@/sports/repository';
import {SEARCH_SUGGESTION_LIMIT} from '@/sports/search-rank';

export async function GET(request:Request):Promise<Response> {
  const url=new URL(request.url);
  const locale=url.searchParams.get('locale');
  const query=sportsQuery(url.searchParams.get('q'));
  if(!isInterfaceLocale(locale)||query.length<1)return Response.json({suggestions:[],providerRequests:0},{status:isInterfaceLocale(locale)?200:400,headers:{'Cache-Control':'no-store'}});
  const connection=databaseUrl();
  if(!connection)return Response.json({error:'SEARCH_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers:{'Cache-Control':'no-store'}});
  const db=new PostgresDatabaseClient(connection);
  try{
    const suggestions=await new SportsRepository(db).search(query,locale);
    if(suggestions.length>SEARCH_SUGGESTION_LIMIT)return Response.json({error:'SEARCH_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers:{'Cache-Control':'no-store'}});
    return Response.json({suggestions,providerRequests:0},{headers:{'Cache-Control':'no-store'}});
  }catch{
    return Response.json({error:'SEARCH_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers:{'Cache-Control':'no-store'}});
  }finally{await db.close();}
}
