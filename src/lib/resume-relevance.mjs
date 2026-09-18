// Local text comparison, not an employer's ATS model or an eligibility decision.
const weights = { required: 3, mentioned: 2, preferred: 1 };
const stopWords = new Set(`about across after also among another applying application applications applicant applicants available background based become being benefits build building candidate candidates career careers company companies competitive consider could culture deliver develop development different during employee employees employer employment equal excellent exciting experience experienced first focus following from full further good great grow have having help highly hiring ideal including join looking make more most must need needs opportunity opportunities other ourselves people person position preferred professional qualifications required requirements responsibilities responsible right role seeking should skills someone strong successful such support team teams than that their them there these they this those through time together using values want well were what when where which while will with within work worked working would year years your you our are and for the can has who how into able ability`.split(/\s+/));

function terms(text) {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) || [])
    .map(word => word.replace(/[.-]+$/, ''))
    .filter(word => word.length >= 4 && !stopWords.has(word)));
}

function headingPriority(line) {
  const title = line.replace(/^[#•*\-\s]+|[:\s]+$/g, '').toLowerCase();
  if (/^(?:minimum |basic |essential |required )?(?:requirements|qualifications|skills)$|^must[- ]haves?$|^what you(?:'|’)ll need$|^what you bring$|^about you$/.test(title)) return 'required';
  if (/^(?:preferred|desired|additional) (?:qualifications|skills)$|^nice[- ]to[- ]haves?$|^bonus(?: points)?$/.test(title)) return 'preferred';
  if (/^(?:key |your )?responsibilities$|^what you(?:'|’)ll do$|^the role$/.test(title)) return 'mentioned';
  if (/^(?:about (?:us|the company)|our (?:company|values|benefits)|benefits|what we offer|equal opportunit(?:y|ies)|compensation)$/.test(title)) return 'ignore';
  return null;
}

export function jobSegments(description) {
  let context = 'mentioned';
  const segments = [];
  for (const raw of description.split(/\n+/)) {
    const line = raw.replace(/^[#•*\-\s]+/, '').trim();
    if (!line) continue;
    const heading = headingPriority(line);
    if (heading) { context = heading; continue; }
    // Handle pasted headings such as "Required skills: Python and SQL".
    const colon = line.indexOf(':');
    const inlineHeading = colon > 0 ? headingPriority(line.slice(0, colon)) : null;
    if (inlineHeading) context = inlineHeading;
    if (context === 'ignore') continue;
    const content = inlineHeading ? line.slice(colon + 1).trim() : line;
    for (const text of content.split(/(?<=[.!?;])\s+(?=[A-Z])/).filter(Boolean)) {
      const priority = /\bnot (?:required|necessary)|\bno\b[^.!?]{0,50}\b(?:required|needed|necessary)\b/i.test(text) ? 'mentioned'
        : /\b(?:nice to have|preferred|desirable|a plus|bonus)\b/i.test(text) ? 'preferred'
        : /\b(?:must|required|essential|at least|minimum)\b/i.test(text) && !/\bnot required\b/i.test(text) ? 'required' : context;
      segments.push({ text, priority });
    }
  }
  return segments;
}

export function createRelevance(description, keywordPatterns) {
  const segments = jobSegments(description);
  const wordWeights = new Map();
  for (const segment of segments) {
    for (const word of terms(segment.text)) wordWeights.set(word, Math.max(wordWeights.get(word) || 0, weights[segment.priority]));
  }
  const targets = keywordPatterns.flatMap(([keyword, pattern]) => {
    const mentions = segments.filter(segment => pattern.test(segment.text) && !/\bnot (?:required|necessary)|\bno\b[^.!?]{0,50}\b(?:required|needed|necessary)\b/i.test(segment.text));
    if (!mentions.length) return [];
    const strongest = mentions.reduce((a, b) => weights[a.priority] >= weights[b.priority] ? a : b);
    return [{ keyword, pattern, priority: strongest.priority, weight: weights[strongest.priority] }];
  });
  function features(text) {
    const result = new Map();
    for (const target of targets) if (target.pattern.test(text)) result.set('skill:' + target.keyword, target.weight * 4);
    for (const word of terms(text)) if (wordWeights.has(word)) result.set('word:' + word, wordWeights.get(word) * .35);
    return result;
  }
  function rank(texts, { limit = texts.length, diverse = false, expandAfter = Infinity } = {}) {
    const remaining = texts.map((text, index) => ({ text, index, features: features(text) }));
    const selected = [], covered = new Set();
    const requiredFeatures = new Set(targets.filter(target => target.priority === 'required').map(target => 'skill:' + target.keyword));
    if (!diverse) {
      return remaining.map(candidate => ({ ...candidate,
        required: Number([...candidate.features.keys()].some(key => requiredFeatures.has(key))),
        value: [...candidate.features.values()].reduce((sum, weight) => sum + weight, 0),
      })).sort((a, b) => b.required - a.required || b.value - a.value || a.index - b.index).slice(0, limit).map(candidate => candidate.text);
    }
    while (remaining.length && selected.length < limit) {
      const value = candidate => [...candidate.features].reduce((sum, [key, weight]) => sum + weight * (diverse && covered.has(key) ? .2 : 1), 0);
      const hasRequired = candidate => Number([...candidate.features.keys()].some(key => requiredFeatures.has(key) && (!diverse || !covered.has(key))));
      remaining.sort((a, b) => hasRequired(b) - hasRequired(a) || value(b) - value(a) || a.index - b.index);
      const eligible = candidate => {
        const fresh = [...candidate.features.keys()].filter(key => !covered.has(key));
        return fresh.some(key => key.startsWith('skill:')) || fresh.filter(key => key.startsWith('word:')).length >= 2;
      };
      const index = selected.length < expandAfter ? 0 : remaining.findIndex(eligible);
      if (index < 0) break;
      const [next] = remaining.splice(index, 1);
      selected.push(next.text);
      for (const key of next.features.keys()) covered.add(key);
    }
    return selected;
  }
  return { segments, targets, rank };
}
