/**
 * P2 — one JSON-LD serializer for every structured-data block. Escapes the
 * characters that could terminate the script element or break the JSON parser
 * when entity names contain `</script>`, `<!--`, U+2028 or U+2029.
 */
export function serializeJsonLd(value:object){
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'}[char]!));
}
export function JsonLd({data}:{data:object|object[]}){
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(data)}}/>;
}
