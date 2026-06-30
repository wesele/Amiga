/**
 * Sync image prompt templates to data/prompts.json
 * Run: node scripts/sync-prompts.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGE_PROMPTS_EXPORT } from '../src/prompts/image-prompts.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const path = join(root, 'data/prompts.json')

const existing = JSON.parse(readFileSync(path, 'utf8'))
const updated = { ...existing, ...IMAGE_PROMPTS_EXPORT }
writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8')
console.log('Updated prompts:', Object.keys(IMAGE_PROMPTS_EXPORT).join(', '))