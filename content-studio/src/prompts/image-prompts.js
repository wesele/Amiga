/** Shared SVG / image prompt templates (synced to data/prompts.json) */

export const SVG_SYSTEM_PROMPT = `You are an expert SVG illustrator for a language-learning app.
Output exactly ONE complete, self-contained <svg>...</svg> that renders in a 400×400 viewport.
Use only: rect, circle, ellipse, path, line, polygon, polyline, g.
Never use: text, tspan, image, foreignObject, filter, linearGradient, radialGradient, mask, animate, script, style blocks.
Use real numeric coordinates and hex colors. Never put "..." placeholders inside tags.
Style: flat educational vector, thick outlines (#333333, stroke-width 3-4), bright fills, pure white background (#FFFFFF).
Center one clear focal subject occupying ~70% of the canvas.`

export const EXAMPLE_SVG_OBJECT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<rect width="400" height="400" fill="#FFFFFF"/>
<ellipse cx="200" cy="280" rx="90" ry="12" fill="#E0E0E0"/>
<rect x="155" y="140" width="90" height="130" rx="8" fill="#4A90D9" stroke="#333333" stroke-width="4"/>
<rect x="170" y="155" width="60" height="45" rx="4" fill="#87CEEB" stroke="#333333" stroke-width="3"/>
<path d="M200 270 L200 310" stroke="#333333" stroke-width="4" stroke-linecap="round"/>
</svg>`

export const EXAMPLE_SVG_PERSON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<rect width="400" height="400" fill="#FFFFFF"/>
<circle cx="200" cy="150" r="50" fill="#FFD1A9" stroke="#333333" stroke-width="4"/>
<circle cx="185" cy="145" r="5" fill="#333333"/>
<circle cx="215" cy="145" r="5" fill="#333333"/>
<path d="M185 165 Q200 178 215 165" fill="none" stroke="#333333" stroke-width="3" stroke-linecap="round"/>
<path d="M150 215 L250 215 L240 320 L160 320 Z" fill="#4A90D9" stroke="#333333" stroke-width="4"/>
<path d="M250 220 L310 150 L325 165 L265 235 Z" fill="#FFD1A9" stroke="#333333" stroke-width="3"/>
</svg>`

export const IMAGE_SVG_GEN_PROMPT = `Draw a language-learning illustration as SVG. Follow the examples' style (flat vector, thick strokes, bright colors, white background).

Example A — everyday object:
${EXAMPLE_SVG_OBJECT}

Example B — person with clear gesture:
${EXAMPLE_SVG_PERSON}

=== YOUR TASK ===
Scene brief (follow this as the single source of truth):
\${sceneBrief}

Learning goal — the image MUST make this concept visually obvious:
\${correctConcept}

Other options in the same question (use different subject, setting, or color — do NOT look similar):
\${distractors}

=== SVG RULES ===
- Output ONLY one <svg>...</svg>, no markdown, no explanation
- xmlns="http://www.w3.org/2000/svg", viewBox="0 0 400 400", width="400" height="400"
- First child: <rect width="400" height="400" fill="#FFFFFF"/>
- 15–35 shape elements; prefer simple geometry over complex paths
- Palette: #4A90D9 #4CAF50 #FFD1A9 #E53935 #FFC107 #333333 #FFFFFF
- NO text, letters, numbers, labels, watermarks, or speech bubbles with readable characters
- One centered focal subject; instantly recognizable at phone thumbnail size (≈120px)`

export const IMAGE_REFINE_PROMPT = `You prepare drawing briefs for SVG illustrations in a language-learning app.
Convert the inputs into ONE concise English brief (4–8 lines) that an SVG illustrator can execute.

Native description: \${desc}
Visual notes: \${prompt}
The image must clearly depict: \${correctConcept}
Other options in the same question (must look visually different): \${distractors}

Brief must specify:
1) Single main subject and action/pose
2) 3–5 concrete visual elements (objects, setting cues)
3) Composition: centered, white background, no clutter
4) Suggested colors from: #4A90D9 #4CAF50 #FFD1A9 #E53935 #FFC107

Do NOT ask for text, words, or labels in the image.
Output ONLY the brief plain text, no markdown, no JSON.`

export const IMAGE_PROMPTS_EXPORT = {
  'image-svg-gen': {
    title: 'SVG 图片生成',
    category: '素材生产',
    content: IMAGE_SVG_GEN_PROMPT
  },
  'image-refine': {
    title: 'SVG 场景分解',
    category: '素材生产',
    content: IMAGE_REFINE_PROMPT
  }
}