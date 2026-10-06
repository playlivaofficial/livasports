import {readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {affiliateHealth,pruneAffiliateAnalytics} from '../src/affiliate/operations';
import {configureCampaign,parseCampaignConfiguration} from '../src/affiliate/configuration';
import {isPublisherEmbed} from '../src/affiliate/types';
import {runMigrations} from '../src/database/migrate';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const command=process.argv[2]??'health';let result;
  if(command==='health')result=await affiliateHealth(db);
  else if(command==='migrate')result={migrations:await runMigrations(db)};
  else if(command==='prune')result=await pruneAffiliateAnalytics(db);
  else if(command==='configure'){
    const file=process.env.LIVASPORTS_AFFILIATE_CONFIG_FILE;if(!file)throw Error('SECURE_CONFIGURATION_FILE_REQUIRED');
    const bytes=await readFile(file);if(bytes.length>32768)throw Error('CONFIGURATION_TOO_LARGE');const config=parseCampaignConfiguration(JSON.parse(bytes.toString('utf8')));if(!config)throw Error('INVALID_APPROVED_CONFIGURATION');
    // Only a locally hosted IMAGE creative has a file to check; a publisher embed has no local asset.
    for(const creative of config.creatives??[])if(!isPublisherEmbed(creative.delivery))await access(resolve('public','.'+creative.imageUrl));result=await configureCampaign(db,config);
  }else throw Error('UNSUPPORTED_OPERATION');
  console.log(JSON.stringify(result));
}catch{console.error('M8_OPERATION_FAILED; private configuration is never printed');process.exitCode=1;}finally{await db.close();}
