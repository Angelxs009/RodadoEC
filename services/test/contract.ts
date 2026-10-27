import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';
import { http, Res } from './helpers';

/**
 * Verificador de conformidad con el contrato oficial autos-openapi-v2.yaml: cada respuesta real del gateway
 * se valida contra el esquema que el contrato declara para ese endpoint y código de estado.
 */
const spec: any = load(readFileSync(join(__dirname, '..', '..', 'contracts', 'autos-openapi-v2.yaml'), 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
for (const f of ['float', 'double', 'int32', 'int64']) ajv.addFormat(f, true);
ajv.addSchema({ components: spec.components }, 'contract');

const deref = (node: any): any => (node?.$ref ? node.$ref.replace('#/', '').split('/').reduce((o: any, k: string) => o[k], spec) : node);

/** Operaciones del contrato, como "GET /autos/{id}", para comprobar que las pruebas las ejercitan todas. */
export const CONTRACT_OPERATIONS: string[] = Object.entries<any>(spec.paths).flatMap(([p, item]) =>
  Object.keys(item)
    .filter((m) => ['get', 'post', 'put', 'delete', 'patch'].includes(m))
    .map((m) => `${m.toUpperCase()} ${p}`),
);

const exercised = new Set<string>();
export const exercisedOperations = () => exercised;

export function schemaErrors(schemaName: string, data: unknown): string[] {
  const validate = ajv.compile({ $ref: `contract#/components/schemas/${schemaName}` });
  return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

/**
 * Llama al gateway (/api/v2) y valida la respuesta contra el contrato.
 *   template: la ruta tal como aparece en el contrato ("/autos/{id}"), para registrar la operación.
 *   Devuelve la respuesta; si el contrato no declara ese código de estado o el cuerpo no cumple, falla la prueba.
 */
export async function v2(
  method: string,
  template: string,
  params: Record<string, string> = {},
  opts: { body?: unknown; headers?: Record<string, string>; query?: Record<string, string | number> } = {},
): Promise<Res> {
  const path = template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k]));
  const qs = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)]))}` : '';
  const res = await http(method, `/api/v2${path}${qs}`, opts.body, opts.headers);
  exercised.add(`${method.toUpperCase()} ${template}`);

  const op = spec.paths[template]?.[method.toLowerCase()];
  if (!op) throw new Error(`El contrato no define ${method} ${template}`);
  const declared = deref(op.responses?.[String(res.status)]);
  if (!declared) {
    throw new Error(
      `${method} ${template} respondió ${res.status}, un código que el contrato no declara (declara: ${Object.keys(op.responses).join(', ')}). Cuerpo: ${JSON.stringify(res.body)}`,
    );
  }
  const media = declared.content?.['application/json'] ?? declared.content?.['application/problem+json'];
  if (media?.schema) {
    // Los $ref del contrato ("#/components/...") apuntan al documento registrado como 'contract'.
    const validate = ajv.compile(JSON.parse(JSON.stringify(media.schema).replace(/"#\/components/g, '"contract#/components')));
    if (!validate(res.body)) {
      const errs = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      throw new Error(`${method} ${template} (${res.status}) no cumple el contrato: ${errs}\nCuerpo: ${JSON.stringify(res.body)}`);
    }
  }
  return res;
}
