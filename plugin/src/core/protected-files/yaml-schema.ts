// yaml-schema.ts — Ajv validator for protected_files.yaml
// Stage 09 — FR-007 Protected Files Resolver.
// Schema version 1: array of rules with id, glob, allowed_personas, deny_message.

import Ajv from 'ajv';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv as any)({ allErrors: true });

const PROTECTED_FILES_SCHEMA = {
  type: 'object',
  required: ['version', 'rules'],
  additionalProperties: false,
  properties: {
    version: { type: 'number', enum: [1] },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'glob', 'allowed_personas', 'deny_message'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          glob: { type: 'string', minLength: 1 },
          allowed_personas: {
            type: 'array',
            items: { type: 'string' },
          },
          deny_message: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export const validateProtectedFilesYaml = ajv.compile(PROTECTED_FILES_SCHEMA);

export interface ProtectedFilesRule {
  id: string;
  glob: string;
  allowed_personas: string[];
  deny_message: string;
}

export interface ProtectedFilesConfig {
  version: 1;
  rules: ProtectedFilesRule[];
}
