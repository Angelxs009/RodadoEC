#!/usr/bin/env node
/**
 * Verificador de compatibilidad de contratos (Semana 7: contratos como código).
 *
 *   node ../contracts/check-compat.js            compara contra contracts/baseline.json
 *   node ../contracts/check-compat.js --update   regenera la línea base (tras publicar una versión)
 *
 * Extrae la "superficie" de cada contrato (endpoints y campos OpenAPI, mensajes/RPC gRPC, tipos GraphQL).
 *   · Algo AGREGADO        → cambio MINOR, compatible: se informa y pasa.
 *   · Algo QUITADO/CAMBIADO → cambio MAJOR (rompe): falla, salvo que la versión mayor del contrato haya subido.
 * Corre desde services/ porque reutiliza sus node_modules (js-yaml, protobufjs, graphql).
 */
const fs = require('fs');
const path = require('path');
const req = (m) => require(require.resolve(m, { paths: [path.join(__dirname, '..', 'services')] }));
const yaml = req('js-yaml');
const protobuf = req('protobufjs');
const { parse } = req('graphql');

const dir = __dirname;
const BASELINE = path.join(dir, 'baseline.json');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(dir, f).split(path.sep).join('/');

function openapiSurface(file) {
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const s = {};
  for (const [p, item] of Object.entries(doc.paths || {}))
    for (const m of Object.keys(item)) if (['get', 'post', 'put', 'delete', 'patch'].includes(m)) s[`${m.toUpperCase()} ${p}`] = Object.keys(item[m].responses || {}).sort().join(',');
  for (const [n, sc] of Object.entries(doc.components?.schemas || {}))
    for (const [prop, def] of Object.entries(sc.properties || {})) s[`schema ${n}.${prop}`] = `${def.type || def.$ref || 'obj'}${(sc.required || []).includes(prop) ? '!' : ''}`;
  return { version: doc.info.version, surface: s };
}
function asyncSurface(file) {
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const s = {};
  const walkSchema = (n, sc) => {
    for (const [prop, def] of Object.entries(sc?.properties || {})) {
      s[`${n}.${prop}`] = `${def.type || 'obj'}${(sc.required || []).includes(prop) ? '!' : ''}`;
      for (const v of def.enum || []) s[`${n}.${prop}=${v}`] = 'enum';
    }
  };
  for (const [n, sc] of Object.entries(doc.components?.schemas || {})) walkSchema(n, sc);
  return { version: doc.info.version, surface: s };
}
function protoSurface(file) {
  const root = new protobuf.Root();
  root.resolvePath = (origin, target) => (path.isAbsolute(target) ? target : fs.existsSync(path.join(dir, 'proto', target)) ? path.join(dir, 'proto', target) : protobuf.util.path.resolve(origin, target));
  root.loadSync(file, { keepCase: true });
  const s = {};
  const visit = (ns) => {
    for (const o of ns.nestedArray || []) {
      if (o instanceof protobuf.Type) for (const f of o.fieldsArray) s[`${o.fullName}.${f.name}`] = `${f.number}:${f.repeated ? 'repeated ' : ''}${f.type}`;
      else if (o instanceof protobuf.Service) for (const m of o.methodsArray) s[`${o.fullName}/${m.name}`] = `${m.requestType}->${m.responseType}`;
      else if (o instanceof protobuf.Enum) for (const [k, v] of Object.entries(o.values)) s[`${o.fullName}.${k}`] = String(v);
      if (o.nested) visit(o);
    }
  };
  visit(root);
  // versión = paquete (autos.<svc>.v1) → mayor v1
  const pkg = fs.readFileSync(file, 'utf8').match(/^package\s+([\w.]+);/m)?.[1] || '';
  return { version: pkg.match(/\.v(\d+)$/)?.[1] + '.0.0', surface: s };
}
function graphqlSurface(file) {
  const text = fs.readFileSync(file, 'utf8');
  const ast = parse(text);
  const s = {};
  const typ = (t) => (t.kind === 'NonNullType' ? typ(t.type) + '!' : t.kind === 'ListType' ? `[${typ(t.type)}]` : t.name.value);
  for (const d of ast.definitions) {
    const name = d.name?.value;
    for (const f of d.fields || []) s[`${name}.${f.name.value}`] = typ(f.type);
    for (const v of d.values || []) s[`${name}=${v.name.value}`] = 'enum';
  }
  return { version: text.match(/#\s*version:\s*([\d.]+)/i)?.[1] || '1.0.0', surface: s };
}

function current() {
  const out = {};
  for (const f of walk(dir)) {
    const r = rel(f);
    if (r === 'autos-openapi.yaml') out[r] = openapiSurface(f);
    else if (r === 'autos-asyncapi.yaml') out[r] = asyncSurface(f);
    else if (r.endsWith('.proto')) out[r] = protoSurface(f);
    else if (r.endsWith('.graphql')) out[r] = graphqlSurface(f);
  }
  return out;
}

const now = current();
if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  console.log(`Línea base actualizada: ${Object.keys(now).length} contratos.`);
  process.exit(0);
}
if (!fs.existsSync(BASELINE)) {
  console.error('No hay contracts/baseline.json. Ejecuta con --update para crearlo.');
  process.exit(2);
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const major = (v) => Number(String(v).split('.')[0]);
let breaking = 0, added = 0;
for (const [file, b] of Object.entries(base)) {
  const c = now[file];
  if (!c) { console.error(`✗ ${file}: contrato eliminado (cambio MAJOR)`); breaking++; continue; }
  const bumped = major(c.version) > major(b.version);
  for (const [k, v] of Object.entries(b.surface)) {
    if (!(k in c.surface)) { (bumped ? console.warn : console.error)(`${bumped ? '!' : '✗'} ${file}: se quitó ${k}`); if (!bumped) breaking++; }
    else if (c.surface[k] !== v) { (bumped ? console.warn : console.error)(`${bumped ? '!' : '✗'} ${file}: cambió ${k}: ${v} → ${c.surface[k]}`); if (!bumped) breaking++; }
  }
  for (const k of Object.keys(c.surface)) if (!(k in b.surface)) added++;
}
for (const file of Object.keys(now)) if (!base[file]) console.log(`+ ${file}: contrato nuevo (MINOR)`);
console.log(`${Object.keys(now).length} contratos revisados · ${added} adiciones compatibles · ${breaking} cambios que rompen`);
process.exit(breaking ? 1 : 0);
