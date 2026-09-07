/**
 * Devanagari → Latin transliteration for Indian voter name search.
 * Enables English queries like "hitesh" to match "हितेश".
 */

const VOWELS = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ऍ: 'e',
  ऑ: 'o',
}

const MATRAS = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ॉ': 'o',
  'ॅ': 'e',
}

const CONSONANTS = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'ng',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'ny',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  क्ष: 'ksh',
  त्र: 'tr',
  ज्ञ: 'gy',
  ळ: 'l',
  फ़: 'f',
  ज़: 'z',
  ड़: 'r',
  ढ़: 'rh',
  क़: 'q',
  ख़: 'kh',
  ग़: 'gh',
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const LATIN_RE = /[a-zA-Z]/

export function hasDevanagari(text) {
  return DEVANAGARI_RE.test(String(text || ''))
}

export function hasLatin(text) {
  return LATIN_RE.test(String(text || ''))
}

function anusvaraSound(nextConsonant) {
  if (!nextConsonant) return 'n'
  const labials = new Set(['प', 'फ', 'ब', 'भ', 'म'])
  if (labials.has(nextConsonant)) return 'm'
  return 'n'
}

function cleanupLatin(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u0964\u0965]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Natural name spelling: drop inherent trailing schwa and common mid-schwa.
 * hitesha → hitesh, raajavaanee → raajvaanee
 */
function applySchwaDeletion(latin) {
  return cleanupLatin(latin)
    .split(' ')
    .map((word) => {
      if (word.length <= 2) return word
      let w = word
      // Drop inherent 'a' before v/w/y (राजवानी → raajvaanee)
      w = w.replace(/([bcdfghjklmnpqrstvwxyz])a([vwy])/g, '$1$2')
      // Drop inherent 'a' before consonant clusters in long names
      w = w.replace(/([bcdfghjklmnpqrstvwxyz])a([bcdfghjklmnpqrstvwxyz]{2,})/g, '$1$2')
      if (/(aa|ee|oo|ai|au)$/.test(w)) return w
      if (w.endsWith('a')) return w.slice(0, -1)
      return w
    })
    .join(' ')
}

function toTitleCaseLatin(value) {
  return cleanupLatin(value)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Transliterate Devanagari text to lowercase Latin (name-friendly).
 */
export function transliterateDevanagari(input) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (!hasDevanagari(text)) return cleanupLatin(text)

  let out = ''
  const chars = [...text]
  let i = 0

  while (i < chars.length) {
    const ch = chars[i]
    const next = chars[i + 1] || ''

    if (/\s/.test(ch)) {
      out += ' '
      i += 1
      continue
    }

    if (VOWELS[ch]) {
      out += VOWELS[ch]
      i += 1
      continue
    }

    // Digraph consonants
    const digraph = ch + next
    if (CONSONANTS[digraph] && next !== '़') {
      // only true digraphs क्ष त्र ज्ञ (2-char keys without nukta)
      if (['क्ष', 'त्र', 'ज्ञ'].includes(digraph)) {
        out += CONSONANTS[digraph]
        i += 2
        const after = chars[i] || ''
        if (after === '्') {
          i += 1
        } else if (MATRAS[after]) {
          out += MATRAS[after]
          i += 1
        } else if (!after || /\s/.test(after) || DEVANAGARI_RE.test(after) === false) {
          out += 'a'
        } else if (CONSONANTS[after] || CONSONANTS[after + (chars[i + 1] || '')]) {
          out += 'a'
        }
        continue
      }
    }

    if (ch === 'ं' || ch === 'ँ') {
      out += anusvaraSound(next)
      i += 1
      continue
    }

    if (ch === 'ः') {
      out += 'h'
      i += 1
      continue
    }

    if (ch === '्' || ch === '़') {
      i += 1
      continue
    }

    if (MATRAS[ch]) {
      out += MATRAS[ch]
      i += 1
      continue
    }

    let consonantKey = ch
    let advance = 1
    if (next === '़') {
      const nuktaForm = ch + '़'
      if (CONSONANTS[nuktaForm]) consonantKey = nuktaForm
      advance = 2
    }

    if (CONSONANTS[consonantKey] || CONSONANTS[ch]) {
      out += CONSONANTS[consonantKey] || CONSONANTS[ch]
      i += advance
      const after = chars[i] || ''

      if (after === '्') {
        i += 1
        continue
      }
      if (MATRAS[after]) {
        out += MATRAS[after]
        i += 1
        continue
      }
      // inherent 'a'
      out += 'a'
      continue
    }

    if (/[0-9a-zA-Z]/.test(ch)) {
      out += ch.toLowerCase()
      i += 1
      continue
    }

    if (DEVANAGARI_RE.test(ch)) {
      i += 1
      continue
    }

    out += ch
    i += 1
  }

  return toTitleCaseLatin(applySchwaDeletion(out))
}

/**
 * Soft fold: normalize vowels / v-w, keep consonant structure.
 */
export function softFold(value) {
  return cleanupLatin(value)
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ai/g, 'e')
    .replace(/au/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/chh/g, 'ch')
    .replace(/v/g, 'w')
    .replace(/\s+/g, '')
}

/**
 * Hard fold: drop short 'a' for schwa-insensitive exact compare.
 */
export function phoneticFold(value) {
  return softFold(value)
    .replace(/a/g, '')
    .replace(/(.)\1+/g, '$1')
}

export function buildNameSearchKeys(...parts) {
  const raw = parts.filter(Boolean).map(String)
  const originals = raw.join(' ')
  const latinParts = raw.map((p) => {
    if (hasDevanagari(p)) return transliterateDevanagari(p)
    return applySchwaDeletion(cleanupLatin(p))
  })
  const latin = latinParts.join(' ').replace(/\s+/g, ' ').trim()
  const words = latin.split(' ').filter(Boolean)
  const softFolds = words.map((w) => softFold(w)).filter(Boolean)
  const hardFolds = words.map((w) => phoneticFold(w)).filter((w) => w.length >= 2)

  const variants = [
    latin,
    latin.replace(/v/g, 'w'),
    latin.replace(/w/g, 'v'),
    latin.replace(/aa/g, 'a'),
    latin.replace(/ee/g, 'i'),
    latin.replace(/oo/g, 'u'),
  ]

  return {
    displayLatin: latin,
    searchText: cleanupLatin([originals, ...variants].join(' ')),
    phonetic: hardFolds.join(' '),
    wordFolds: hardFolds,
    softFolds,
  }
}

function phoneticTokenMatch(token, hardFolds, softFolds) {
  const tokenSoft = softFold(token)
  const tokenHard = phoneticFold(token)
  if (!tokenSoft) return false

  // Soft exact
  if (tokenSoft.length >= 2 && softFolds.some((w) => w === tokenSoft)) return true

  // Soft prefix for partial typing (min 4 chars)
  if (tokenSoft.length >= 4 && softFolds.some((w) => w.startsWith(tokenSoft))) return true

  // Hard exact when soft onset also agrees (ramlal ≈ raamalaal, not sharma ≈ aasharam)
  if (tokenHard.length >= 3) {
    const softPrefix = tokenSoft.slice(0, Math.min(2, tokenSoft.length))
    for (let i = 0; i < hardFolds.length; i += 1) {
      if (hardFolds[i] !== tokenHard) continue
      const sw = softFolds[i] || ''
      if (!sw) continue
      if (sw.startsWith(softPrefix) || tokenSoft.startsWith(sw.slice(0, 2))) return true
    }
  }
  return false
}

export function matchesSearch(
  query,
  searchText,
  phonetic,
  wordFolds = null,
  searchHi = '',
  softFolds = null,
) {
  const qRaw = String(query || '').trim()
  if (!qRaw) return true

  const hard =
    Array.isArray(wordFolds) && wordFolds.length
      ? wordFolds
      : String(phonetic || '')
          .split(/\s+/)
          .filter(Boolean)

  const soft = Array.isArray(softFolds) && softFolds.length ? softFolds : hard

  if (hasDevanagari(qRaw)) {
    const qHi = qRaw.replace(/\s+/g, ' ').trim()
    if (String(searchHi || '').includes(qHi)) return true
    return matchesSearch(transliterateDevanagari(qRaw), searchText, phonetic, hard, searchHi, soft)
  }

  const q = cleanupLatin(qRaw)
  const hay = cleanupLatin(searchText)
  const hayWords = hay.split(/\s+/).filter(Boolean)

  if (hay.includes(q)) return true

  // Word-wise: query may be compressed form of a single word (ramlal ≈ raamalaal)
  const qCompact = q.replace(/\s+/g, '')
  if (qCompact.length >= 3) {
    const hitWord = hayWords.some((w) => {
      const wc = w.replace(/\s+/g, '')
      if (wc.length < 3) return false
      if (wc.includes(qCompact)) return true
      // Allow reverse only when word is almost as long as query (not "ram" inside "ramlal")
      if (wc.length >= qCompact.length - 1 && qCompact.includes(wc)) return true
      return false
    })
    if (hitWord) return true
  }

  const tokens = q.split(' ').filter(Boolean)
  return tokens.every((token) => {
    if (token.length < 2) return true
    if (hayWords.some((w) => w.includes(token) && token.length >= 3)) return true
    return phoneticTokenMatch(token, hard, soft)
  })
}


