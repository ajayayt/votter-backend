import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  buildNameSearchKeys,
  hasDevanagari,
  hasLatin,
  matchesSearch,
  transliterateDevanagari,
} from './transliterate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(__dirname, '../../data')

let votersCache = null
let votersMtime = null
let usersCache = null
let usersMtime = null

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file missing: ${path.basename(filePath)}`)
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in ${path.basename(filePath)}`)
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * Split a name into Hindi / English using script detection + transliteration.
 */
function resolveNamePair(explicitEn, explicitHi, fallback) {
  let nameEn = String(explicitEn || '').trim()
  let nameHi = String(explicitHi || '').trim()
  const raw = String(fallback || '').trim()

  if (raw) {
    if (hasDevanagari(raw) && !nameHi) {
      nameHi = raw
    } else if (hasLatin(raw) && !hasDevanagari(raw) && !nameEn) {
      nameEn = raw
    } else if (!nameEn && !nameHi) {
      if (hasDevanagari(raw)) nameHi = raw
      else nameEn = raw
    }
  }

  // Mis-assigned: Hindi sitting in English field
  if (nameEn && hasDevanagari(nameEn) && !hasLatin(nameEn)) {
    if (!nameHi) nameHi = nameEn
    nameEn = ''
  }
  if (nameHi && hasLatin(nameHi) && !hasDevanagari(nameHi)) {
    if (!nameEn) nameEn = nameHi
    nameHi = ''
  }

  // Generate Latin display/search name when only Hindi exists
  if (!nameEn && nameHi) {
    nameEn = transliterateDevanagari(nameHi)
  }

  return { nameEn, nameHi }
}

export function normalizeVoter(voter, index = 0, defaults = {}) {
  const get = (keys, fallback = null) => {
    for (const key of keys) {
      if (voter[key] != null && voter[key] !== '') return voter[key]
    }
    return fallback
  }

  const epic = String(get(['epic_no', 'voter_id', 'epic', 'epic_number', 'voterId'], '') || '')
  const id = String(get(['id', 'record_id'], epic || String(index + 1)))

  const namePair = resolveNamePair(
    get(['name_en', 'name_english', 'english_name'], ''),
    get(['name_hi', 'name_hindi', 'hindi_name'], ''),
    get(['name'], ''),
  )

  const relativePair = resolveNamePair(
    get(
      ['father_name_en', 'relative_name_en', 'relative_name_english', 'relative_english'],
      '',
    ),
    get(['father_name_hi', 'relative_name_hi', 'husband_name_hi', 'mother_name_hi'], ''),
    get(
      ['relative_name', 'father_name', 'husband_name', 'mother_name', 'guardian_name', 'relation_name'],
      '',
    ),
  )

  const nameKeys = buildNameSearchKeys(namePair.nameHi, namePair.nameEn)
  const relativeKeys = buildNameSearchKeys(relativePair.nameHi, relativePair.nameEn)

  const houseNo = String(get(['house_no', 'house', 'house_number', 'address'], '') || '')
  let partNo = String(get(['part_no', 'part', 'part_number', 'bhag', 'bhag_no', 'bhag_sankhya'], '') || '')
  let wardNo = String(get(['ward_no', 'ward', 'ward_number', 'ward_sankhya'], '') || '')
  const serialNo = String(get(['serial_no', 'sl_no', 'serial', 'serial_number'], '') || '')
  let polling = String(get(['polling_station', 'polling_booth', 'booth', 'ps_name'], '') || '')
  const relation = String(get(['relation', 'relationship', 'relation_type'], '') || '')
  const genderRaw = String(get(['gender', 'sex'], '') || '')
  const district = String(
    get(['district', 'district_name', 'zilla', 'zila'], '') || defaults.district || '',
  ).trim()

  if (!wardNo && defaults.ward_no) wardNo = String(defaults.ward_no)
  if (!partNo && defaults.part_no) partNo = String(defaults.part_no)
  // Prefer explicit booth; otherwise fill from part → booth map
  if (partNo && defaults.pollingByPart && typeof defaults.pollingByPart === 'object') {
    const mapped = String(
      defaults.pollingByPart[partNo] || defaults.pollingByPart[String(Number(partNo))] || '',
    ).trim()
    if (mapped) polling = mapped
  }

  const assemblyRaw = String(
    get(
      [
        'assembly',
        'vidhan_sabha',
        'vidhan_sabha_name',
        'constituency',
        'ac_name',
        'assembly_name',
        'assembly_constituency',
      ],
      '',
    ) || '',
  ).trim()
  let assemblyNo = String(
    get(['assembly_no', 'ac_no', 'constituency_no', 'vidhan_sabha_no'], '') || '',
  ).trim()

  let assembly = assemblyRaw
  const keepAssemblyFromImport = Boolean(defaults.assembly || defaults.assembly_no)

  if (!assembly && defaults.assembly) assembly = String(defaults.assembly).trim()
  if (!assemblyNo && defaults.assembly_no) assemblyNo = String(defaults.assembly_no).trim()

  if (assembly && !assemblyNo) {
    const m = assembly.match(/^(.*?)[\s-]*(\d{1,4})$/)
    if (m) {
      assembly = m[1].trim() || assembly
      assemblyNo = m[2]
    }
  }

  if (
    !keepAssemblyFromImport &&
    assembly === 'Soorsagar' &&
    (assemblyNo === '129' || !assemblyNo)
  ) {
    assembly = ''
    assemblyNo = ''
  }

  if (defaults.force) {
    if (defaults.ward_no) wardNo = String(defaults.ward_no)
    if (defaults.part_no) partNo = String(defaults.part_no)
    if (defaults.assembly) assembly = String(defaults.assembly).trim()
    if (defaults.assembly_no) assemblyNo = String(defaults.assembly_no).trim()
  }

  const searchText = [
    nameKeys.searchText,
    relativeKeys.searchText,
    epic,
    houseNo,
    partNo,
    wardNo,
    serialNo,
    polling,
    relation,
    genderRaw,
    assembly,
    assemblyNo,
    district,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  const searchHi = [namePair.nameHi, relativePair.nameHi].filter(Boolean).join(' ')

  const wordFolds = [...(nameKeys.wordFolds || []), ...(relativeKeys.wordFolds || [])]
  const softFolds = [...(nameKeys.softFolds || []), ...(relativeKeys.softFolds || [])]
  if (epic) {
    const epicKey = phoneticFoldSafe(epic)
    wordFolds.push(epicKey)
    softFolds.push(epicKey)
  }

  return {
    ...voter,
    id,
    epic_no: epic,
    name_en: namePair.nameEn,
    name_hi: namePair.nameHi,
    father_name_en: relativePair.nameEn,
    father_name_hi: relativePair.nameHi,
    relation,
    name: namePair.nameHi || namePair.nameEn,
    name_english: namePair.nameEn,
    relative_name: relativePair.nameHi || relativePair.nameEn,
    relative_name_english: relativePair.nameEn,
    house_no: houseNo,
    house_number: houseNo,
    age: get(['age'], null),
    gender: genderRaw,
    district,
    ward_no: wardNo,
    ward_number: wardNo,
    part_no: partNo,
    part_number: partNo,
    serial_no: serialNo,
    serial_number: serialNo,
    polling_station: polling,
    polling_booth: polling,
    assembly,
    assembly_no: assemblyNo,
    voter_id: epic,
    photo: get(['photo', 'photo_url', 'image'], null),
    dob: get(['dob', 'date_of_birth', 'birth_date'], null),
    password: get(['password'], null),
    _search: searchText,
    _searchHi: searchHi,
    _phonetic: wordFolds.join(' '),
    _wordFolds: wordFolds,
    _softFolds: softFolds,
    _nameSearch: nameKeys.searchText,
    _nameSearchHi: namePair.nameHi || '',
    _nameWordFolds: nameKeys.wordFolds || [],
    _nameSoftFolds: nameKeys.softFolds || [],
    _relSearch: relativeKeys.searchText,
    _relSearchHi: relativePair.nameHi || '',
    _relWordFolds: relativeKeys.wordFolds || [],
    _relSoftFolds: relativeKeys.softFolds || [],
  }
}

function phoneticFoldSafe(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function extractVoters(decoded) {
  if (!decoded) return []
  if (Array.isArray(decoded)) return decoded
  if (Array.isArray(decoded.voters)) return decoded.voters
  return []
}

export function publicVoter(voter) {
  const copy = { ...voter }
  delete copy.password
  delete copy.dob
  delete copy._search
  delete copy._searchHi
  delete copy._phonetic
  delete copy._wordFolds
  delete copy._softFolds
  delete copy._nameSearch
  delete copy._nameSearchHi
  delete copy._nameWordFolds
  delete copy._nameSoftFolds
  delete copy._relSearch
  delete copy._relSearchHi
  delete copy._relWordFolds
  delete copy._relSoftFolds
  return copy
}

export function loadVoters({ force = false } = {}) {
  const filePath = path.join(DATA_DIR, 'voters.json')
  const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : null

  if (!force && votersCache && votersMtime === mtime) {
    return votersCache
  }

  const decoded = readJson(filePath)
  const list = extractVoters(decoded)
  const root = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {}
  const defaults = {
    district: String(root.district || root.district_name || '').trim(),
    ward_no: String(root.ward_no || root.ward_number || '').trim(),
    part_no: String(root.part_no || root.part_number || '').trim(),
    assembly: String(root.assembly || '').trim(),
    assembly_no: String(root.assembly_no || '').trim(),
    pollingByPart: root.polling_stations_by_part || root.polling_booths_by_part || {},
  }

  votersCache = list.map((v, i) => normalizeVoter(v, i, defaults))
  votersMtime = mtime
  return votersCache
}

export function clearVotersCache() {
  votersCache = null
  votersMtime = null
}

function decodeLookupKey(id) {
  let needle = String(id || '').trim()
  if (!needle) return ''
  try {
    needle = decodeURIComponent(needle)
  } catch {
    // already decoded
  }
  return needle
}

function voterLookupKeys(voter) {
  return [voter.id, voter.epic_no, voter.voter_id]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean)
}

export function findVoter(id) {
  const needle = decodeLookupKey(id).toUpperCase()
  if (!needle) return null
  return loadVoters().find((v) => voterLookupKeys(v).includes(needle)) || null
}

export function findById(id) {
  return findVoter(id)
}

export function findByEpic(epic) {
  return findVoter(epic)
}

export function searchVoters(query, filters = {}) {
  const opts = typeof query === 'object' && query != null ? query : { search: query, ...filters }
  const nameQ = String(opts.name || '').trim()
  const fatherQ = String(opts.father || opts.relative || '').trim()
  const epicQ = String(opts.epic || '').trim()
  const generalQ = String(opts.search || '').trim()
  const wardQ = String(opts.ward || opts.ward_no || '').trim()
  const partQ = String(opts.part || opts.part_no || opts.bhag || '').trim()
  const exactAge = String(opts.age || '').trim()
  const minAge = Number(opts.age_min)
  const maxAge = Number(opts.age_max)

  let list = loadVoters()

  if (wardQ) {
    list = list.filter((v) => String(v.ward_no || v.ward_number || '').trim() === wardQ)
  }
  if (partQ) {
    list = list.filter((v) => String(v.part_no || v.part_number || '').trim() === partQ)
  }

  if (exactAge !== '' && Number.isFinite(Number(exactAge))) {
    const ageN = Number(exactAge)
    list = list.filter((v) => Number(v.age) === ageN)
  } else {
    if (Number.isFinite(minAge) && opts.age_min !== '' && opts.age_min != null) {
      list = list.filter((v) => Number.isFinite(Number(v.age)) && Number(v.age) >= minAge)
    }
    if (Number.isFinite(maxAge) && opts.age_max !== '' && opts.age_max != null) {
      list = list.filter((v) => Number.isFinite(Number(v.age)) && Number(v.age) <= maxAge)
    }
  }

  if (nameQ) {
    list = list.filter((voter) =>
      matchesSearch(
        nameQ,
        voter._nameSearch || '',
        (voter._nameWordFolds || []).join(' '),
        voter._nameWordFolds || [],
        voter._nameSearchHi || '',
        voter._nameSoftFolds || [],
      ),
    )
  }

  if (fatherQ) {
    list = list.filter((voter) =>
      matchesSearch(
        fatherQ,
        voter._relSearch || '',
        (voter._relWordFolds || []).join(' '),
        voter._relWordFolds || [],
        voter._relSearchHi || '',
        voter._relSoftFolds || [],
      ),
    )
  }

  if (epicQ) {
    const needle = epicQ.toUpperCase().replace(/\s+/g, '')
    list = list.filter((v) =>
      String(v.epic_no || v.voter_id || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .includes(needle),
    )
  }

  if (generalQ) {
    list = list.filter((voter) =>
      matchesSearch(
        generalQ,
        voter._search || '',
        voter._phonetic || '',
        voter._wordFolds || [],
        voter._searchHi || '',
        voter._softFolds || [],
      ),
    )
  }

  const rankQ = nameQ || fatherQ || epicQ || generalQ
  if (rankQ) {
    return rankSearchResults(list, rankQ, {
      nameOnly: Boolean(nameQ) && !fatherQ && !epicQ && !generalQ,
      fatherOnly: Boolean(fatherQ) && !nameQ && !epicQ && !generalQ,
    })
  }

  return list
}

function sortNumericLabel(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function voterFilterOptions() {
  const voters = loadVoters()
  const wards = new Set()
  const parts = new Set()
  const partsByWard = {}
  let minAge = null
  let maxAge = null

  for (const voter of voters) {
    const ward = String(voter.ward_no || voter.ward_number || '').trim()
    const part = String(voter.part_no || voter.part_number || '').trim()
    if (ward) {
      wards.add(ward)
      if (!partsByWard[ward]) partsByWard[ward] = new Set()
      if (part) partsByWard[ward].add(part)
    }
    if (part) parts.add(part)
    const age = Number(voter.age)
    if (Number.isFinite(age)) {
      minAge = minAge == null ? age : Math.min(minAge, age)
      maxAge = maxAge == null ? age : Math.max(maxAge, age)
    }
  }

  return {
    wards: [...wards].sort(sortNumericLabel),
    parts: [...parts].sort(sortNumericLabel),
    parts_by_ward: Object.fromEntries(
      Object.entries(partsByWard).map(([ward, set]) => [ward, [...set].sort(sortNumericLabel)]),
    ),
    age_min: minAge,
    age_max: maxAge,
  }
}

/**
 * Prefer exact EPIC / name hits over relative-name-only matches.
 */
function rankSearchResults(voters, query, mode = {}) {
  const q = String(query || '').trim().toLowerCase()
  const qCompact = q.replace(/\s+/g, '')
  const qRaw = String(query || '').trim()

  const score = (voter) => {
    let s = 0
    const epic = String(voter.epic_no || '').toLowerCase()
    const nameEn = String(voter.name_en || '').toLowerCase()
    const nameHi = String(voter.name_hi || '')
    const relEn = String(voter.father_name_en || '').toLowerCase()
    const relHi = String(voter.father_name_hi || '')
    const nameEnCompact = nameEn.replace(/\s+/g, '')
    const relEnCompact = relEn.replace(/\s+/g, '')

    if (!mode.fatherOnly) {
      if (epic && epic === q) s += 1000
      else if (epic && epic.includes(q)) s += 700

      if (nameHi && nameHi.includes(qRaw)) s += 900
      if (nameEn === q || nameEnCompact === qCompact) s += 850
      if (nameEn.startsWith(q) || nameEnCompact.startsWith(qCompact)) s += 600
      if (nameEn.includes(q) || nameEnCompact.includes(qCompact)) s += 400
      if (nameEn) s += Math.max(0, 40 - nameEn.length)
    }

    if (!mode.nameOnly) {
      if (relHi && relHi.includes(qRaw)) s += mode.fatherOnly ? 900 : 200
      if (relEn === q || relEnCompact === qCompact) s += mode.fatherOnly ? 850 : 180
      if (relEn.includes(q)) s += mode.fatherOnly ? 400 : 150
    }

    return s
  }

  return [...voters].sort((a, b) => score(b) - score(a))
}

export function paginate(items, page = 1, perPage = 20) {
  const total = items.length
  const size = Math.max(1, Math.min(100, Number(perPage) || 20))
  const lastPage = Math.max(1, Math.ceil(total / size))
  const current = Math.max(1, Math.min(Number(page) || 1, lastPage))
  const offset = (current - 1) * size
  const data = items.slice(offset, offset + size)

  return {
    data,
    total,
    per_page: size,
    current_page: current,
    last_page: lastPage,
    from: total === 0 ? null : offset + 1,
    to: total === 0 ? null : offset + data.length,
  }
}

export function voterStats() {
  const voters = loadVoters()
  let male = 0
  let female = 0
  let other = 0

  for (const voter of voters) {
    const g = String(voter.gender || '').toLowerCase().trim()
    if (['m', 'male', 'पुरुष'].includes(g)) male += 1
    else if (['f', 'female', 'महिला', 'स्त्री'].includes(g)) female += 1
    else other += 1
  }

  return { total: voters.length, male, female, other }
}

function stripInternalFields(voter) {
  const row = { ...voter }
  delete row._search
  delete row._searchHi
  delete row._phonetic
  delete row._wordFolds
  delete row._softFolds
  delete row._nameSearch
  delete row._nameSearchHi
  delete row._nameWordFolds
  delete row._nameSoftFolds
  delete row._relSearch
  delete row._relSearchHi
  delete row._relWordFolds
  delete row._relSoftFolds
  return row
}

function uniqueVoterKey(voter) {
  const epic = String(voter.epic_no || '').trim().toUpperCase()
  if (epic) return `epic:${epic}`
  const id = String(voter.id || '').trim().toUpperCase()
  if (id) return `id:${id}`
  return ''
}

/**
 * Merge/add import: only new unique voters are appended.
 * Existing voters are never replaced.
 * Ward / part / assembly come from each voter row (or optional top-level JSON keys).
 */
export function importVotersFromJsonString(jsonString) {
  let decoded
  try {
    decoded = JSON.parse(jsonString)
  } catch {
    throw new Error('Invalid JSON: unable to parse file')
  }

  const list = extractVoters(decoded)
  if (!list.length) {
    throw new Error('No voter records found in the JSON file.')
  }

  const root = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {}
  const defaults = {
    assembly: String(root.assembly || root.vidhan_sabha || root.ac_name || '').trim(),
    assembly_no: String(root.assembly_no || root.ac_no || '').trim(),
    ward_no: String(root.ward_no || root.ward_number || '').trim(),
    part_no: String(root.part_no || root.part_number || '').trim(),
    district: String(root.district || root.district_name || '').trim(),
    pollingByPart: root.polling_stations_by_part || root.polling_booths_by_part || {},
    force: false,
  }

  if (defaults.assembly && !defaults.assembly_no) {
    const m = defaults.assembly.match(/^(.*?)[\s-]*(\d{1,4})$/)
    if (m) {
      defaults.assembly = m[1].trim() || defaults.assembly
      defaults.assembly_no = m[2]
    }
  }

  const incoming = list
    .filter((v) => v && typeof v === 'object')
    .map((v, i) => normalizeVoter(v, i, defaults))
    .filter((v) => uniqueVoterKey(v))

  if (!incoming.length) {
    throw new Error('No valid voter records with voter ID found in the JSON file.')
  }

  const existing = loadVoters().map(stripInternalFields)
  const indexByKey = new Map()
  existing.forEach((v, i) => {
    const key = uniqueVoterKey(v)
    if (key) indexByKey.set(key, i)
  })

  const toAdd = []
  let updated = 0
  let skipped = 0

  for (const voter of incoming) {
    const key = uniqueVoterKey(voter)
    const row = stripInternalFields(voter)
    if (!key) {
      skipped += 1
      continue
    }
    if (indexByKey.has(key)) {
      const idx = indexByKey.get(key)
      if (idx < existing.length) {
        existing[idx] = mergeImportedVoter(existing[idx], row)
      } else {
        const addIdx = idx - existing.length
        toAdd[addIdx] = mergeImportedVoter(toAdd[addIdx], row)
      }
      updated += 1
      continue
    }
    indexByKey.set(key, existing.length + toAdd.length)
    toAdd.push(row)
  }

  if (!toAdd.length && !updated) {
    return {
      added: 0,
      updated: 0,
      skipped,
      total: existing.length,
      message: `No changes. ${skipped} record(s) could not be imported.`,
    }
  }

  const merged = [...existing, ...toAdd]
  const filePath = path.join(DATA_DIR, 'voters.json')
  writeJson(filePath, { voters: merged })
  clearVotersCache()

  const parts = []
  if (toAdd.length) parts.push(`Added ${toAdd.length} new voter(s)`)
  if (updated) parts.push(`updated ${updated} existing record(s)`)
  if (skipped) parts.push(`skipped ${skipped}`)

  return {
    added: toAdd.length,
    updated,
    skipped,
    total: merged.length,
    message: `${parts.join(', ')}. Total now ${merged.length}.`,
  }
}

function mergeImportedVoter(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    photo: incoming.photo || existing.photo || null,
    password: existing.password || incoming.password || null,
    dob: incoming.dob || existing.dob || null,
  }
}

export function loadUsers({ force = false } = {}) {
  const filePath = path.join(DATA_DIR, 'users.json')
  const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : null

  if (!force && usersCache && usersMtime === mtime) {
    return usersCache
  }

  const decoded = readJson(filePath)
  const users = Array.isArray(decoded?.users)
    ? decoded.users
    : Array.isArray(decoded)
      ? decoded
      : []

  usersCache = users.filter((u) => u && typeof u === 'object')
  usersMtime = mtime
  return usersCache
}

export function clearUsersCache() {
  usersCache = null
  usersMtime = null
}

export function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase()
  return loadUsers().find((u) => String(u.username || '').toLowerCase() === needle) || null
}

export function findUserById(id) {
  return loadUsers().find((u) => String(u.id) === String(id)) || null
}

export function saveUsers(users) {
  const filePath = path.join(DATA_DIR, 'users.json')
  writeJson(filePath, { users })
  clearUsersCache()
}

export function updateUserPassword(userId, hashedPassword) {
  const users = loadUsers().map((u) => ({ ...u }))
  const idx = users.findIndex((u) => String(u.id) === String(userId))
  if (idx === -1) return false
  users[idx].password = hashedPassword
  saveUsers(users)
  return true
}

function publicUser(user) {
  return {
    id: String(user.id || ''),
    username: String(user.username || ''),
    name: String(user.name || user.username || ''),
    role: String(user.role || 'customer'),
    created_at: user.created_at || null,
  }
}

export function listCustomers() {
  return loadUsers()
    .filter((u) => String(u.role || '').toLowerCase() === 'customer')
    .map(publicUser)
}

export function createCustomer({ username, name, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase()
  const cleanName = String(name || '').trim()
  const hashedPassword = String(password || '')

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.')
  }
  if (!/^[a-z0-9._-]+$/i.test(cleanUsername)) {
    throw new Error('Username may only contain letters, numbers, dot, underscore and hyphen.')
  }
  if (!cleanName) {
    throw new Error('Name is required.')
  }
  if (!hashedPassword) {
    throw new Error('Password is required.')
  }
  if (findUserByUsername(cleanUsername)) {
    throw new Error('Username already exists.')
  }

  const users = loadUsers().map((u) => ({ ...u }))
  const nextId = String(
    users.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0) + 1,
  )

  const user = {
    id: nextId,
    username: cleanUsername,
    name: cleanName,
    password: hashedPassword,
    role: 'customer',
    created_at: new Date().toISOString(),
  }

  users.push(user)
  saveUsers(users)
  return publicUser(user)
}

export function deleteCustomer(userId) {
  const users = loadUsers()
  const target = users.find((u) => String(u.id) === String(userId))
  if (!target) return false
  if (String(target.role || '').toLowerCase() !== 'customer') {
    throw new Error('Only customer accounts can be deleted here.')
  }
  saveUsers(users.filter((u) => String(u.id) !== String(userId)))
  return true
}

export function resetCustomerPassword(userId, hashedPassword) {
  const users = loadUsers().map((u) => ({ ...u }))
  const idx = users.findIndex((u) => String(u.id) === String(userId))
  if (idx === -1) return false
  if (String(users[idx].role || '').toLowerCase() !== 'customer') {
    throw new Error('Only customer passwords can be reset here.')
  }
  users[idx].password = hashedPassword
  saveUsers(users)
  return true
}
