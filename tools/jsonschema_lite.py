"""JSON Schema（draft 2020-12）的小子集校验器，给 tools/check_maps.py 用：不引第三方依赖（本机 / CI 都没装 jsonschema）。

支持的关键字见 KNOWN；schema 里出现别的关键字直接报错（不会悄悄不校验）。$ref 只支持本文件内的 "#/$defs/<名>"。
用法：errors = validate(instance, schema)  → ['<路径>: <说明>', ...]
"""
import re

KNOWN = {'$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'enum', 'const', 'properties', 'required',
         'additionalProperties', 'patternProperties', 'propertyNames', 'minProperties', 'items', 'minItems', 'maxItems',
         'minLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'allOf', 'anyOf', 'oneOf'}
_T = {'object': lambda v: isinstance(v, dict), 'array': lambda v: isinstance(v, list), 'string': lambda v: isinstance(v, str),
      'boolean': lambda v: isinstance(v, bool), 'null': lambda v: v is None,
      'integer': lambda v: isinstance(v, int) and not isinstance(v, bool) or isinstance(v, float) and v.is_integer(),
      'number': lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)}


def validate(inst, schema, root=None, path='$'):
    root = root or schema
    out = []
    if schema is True or schema == {}: return out
    if schema is False: return [f'{path}: 不允许出现']
    bad = set(schema) - KNOWN
    if bad: raise ValueError(f'jsonschema_lite 不支持的关键字 {sorted(bad)}（{path}）')
    if '$ref' in schema:
        ref = schema['$ref']
        if not ref.startswith('#/$defs/'): raise ValueError(f'只支持 #/$defs/ 引用：{ref}')
        out += validate(inst, root['$defs'][ref[8:]], root, path)
    if 'type' in schema:
        ts = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        if not any(_T[t](inst) for t in ts): return out + [f'{path}: 应为 {"/".join(ts)}，现在是 {type(inst).__name__}']
    if 'enum' in schema and inst not in schema['enum']: out.append(f'{path}: 应为 {schema["enum"]} 之一，现在是 {inst!r}')
    if 'const' in schema and inst != schema['const']: out.append(f'{path}: 应为 {schema["const"]!r}')
    for s in schema.get('allOf', []): out += validate(inst, s, root, path)
    if 'anyOf' in schema and not any(not validate(inst, s, root, path) for s in schema['anyOf']): out.append(f'{path}: 不符合 anyOf 的任何一项')
    if 'oneOf' in schema and sum(not validate(inst, s, root, path) for s in schema['oneOf']) != 1: out.append(f'{path}: 应恰好符合 oneOf 的一项')
    if isinstance(inst, dict):
        for k in schema.get('required', []):
            if k not in inst: out.append(f'{path}: 缺字段 {k}')
        if len(inst) < schema.get('minProperties', 0): out.append(f'{path}: 至少 {schema["minProperties"]} 项')
        props, pats = schema.get('properties', {}), schema.get('patternProperties', {})
        for k, v in inst.items():
            p = f'{path}.{k}'
            if 'propertyNames' in schema: out += [e.replace(p, f'{path} 的键 {k!r}', 1) for e in validate(k, schema['propertyNames'], root, p)]
            hit = False
            if k in props: out += validate(v, props[k], root, p); hit = True
            for rx, s in pats.items():
                if re.search(rx, k): out += validate(v, s, root, p); hit = True
            if not hit and 'additionalProperties' in schema:
                ap = schema['additionalProperties']
                if ap is False: out.append(f'{p}: 未登记的字段（先在 schema 里加上并写 description）')
                else: out += validate(v, ap, root, p)
    if isinstance(inst, list):
        if len(inst) < schema.get('minItems', 0): out.append(f'{path}: 至少 {schema["minItems"]} 项，现在 {len(inst)}')
        if 'maxItems' in schema and len(inst) > schema['maxItems']: out.append(f'{path}: 最多 {schema["maxItems"]} 项，现在 {len(inst)}')
        if 'items' in schema:
            for i, v in enumerate(inst): out += validate(v, schema['items'], root, f'{path}[{i}]')
    if isinstance(inst, str):
        if len(inst) < schema.get('minLength', 0): out.append(f'{path}: 不能为空' if schema['minLength'] == 1 else f'{path}: 至少 {schema["minLength"]} 个字符')
        if 'pattern' in schema and not re.search(schema['pattern'], inst): out.append(f'{path}: {inst!r} 不符合 {schema["pattern"]}')
    if _T['number'](inst):
        if 'minimum' in schema and inst < schema['minimum']: out.append(f'{path}: 应 ≥ {schema["minimum"]}，现在 {inst}')
        if 'maximum' in schema and inst > schema['maximum']: out.append(f'{path}: 应 ≤ {schema["maximum"]}，现在 {inst}')
        if 'exclusiveMinimum' in schema and inst <= schema['exclusiveMinimum']: out.append(f'{path}: 应 > {schema["exclusiveMinimum"]}，现在 {inst}')
        if 'exclusiveMaximum' in schema and inst >= schema['exclusiveMaximum']: out.append(f'{path}: 应 < {schema["exclusiveMaximum"]}，现在 {inst}')
    return out
