// protocol.mjs 的类型声明，供 TypeScript 项目（如 frontend）直接导入
import type { Persona, PersonaFile, Session, SessionFile } from './types';

export interface Report { errors: string[]; warnings: string[]; readonly ok: boolean }

export declare const SCHEMA_VERSION: '1.0';
export declare const ENUMS: Readonly<Record<string, readonly string[]>>;
export declare function avatarOf(persona: Persona):
  | { kind: 'image'; src: string; color: string }
  | { kind: 'placeholder'; glyph: string; color: string };
export declare function loadPersona(doc: unknown): { report: Report; persona: Persona | null };
export declare function loadSession(doc: unknown, personas: Map<string, Persona>): { report: Report; session: Session | null };
export type { Persona, PersonaFile, Session, SessionFile };
