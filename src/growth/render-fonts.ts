import 'server-only';
import {join} from 'node:path';

/** Serverless Linux has no system Arial. Configure font discovery before the first SVG raster. */
export function configureGrowthFonts(env:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform,root=process.cwd()){
  if(platform!=='linux')return;
  env.FONTCONFIG_PATH=join(root,'public/growth/fonts');
  env.FONTCONFIG_FILE=join(root,'public/growth/fonts/fonts.conf');
}
configureGrowthFonts();
