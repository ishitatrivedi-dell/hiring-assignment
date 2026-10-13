export function normalizeWhitespace(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

export function verifyQuote(documentText = '', quote = '') {
  const normalizedDocument = normalizeWhitespace(documentText)
  const normalizedQuote = normalizeWhitespace(quote)

  if (!normalizedQuote) {
    return {
      verified: false,
      occurrences: [],
      quotedText: '',
      firstIndex: -1,
    }
  }

  const occurrences = []
  let index = normalizedDocument.indexOf(normalizedQuote)

  while (index >= 0) {
    occurrences.push({
      start: index,
      end: index + normalizedQuote.length,
    })
    index = normalizedDocument.indexOf(normalizedQuote, index + normalizedQuote.length)
  }

  return {
    verified: occurrences.length > 0,
    occurrences,
    quotedText: normalizedQuote,
    firstIndex: occurrences[0]?.start ?? -1,
  }
}

function extractKeywords(question = '') {
  return normalizeWhitespace(question)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['what', 'when', 'where', 'which', 'the', 'this', 'that', 'with', 'from', 'into', 'there', 'their', 'about', 'have', 'does', 'doesnt', 'will', 'your', 'should', 'were', 'been', 'than', 'then'].includes(word))
}

function scoreSentence(documentText, sentence) {
  const normalizedSentence = normalizeWhitespace(sentence).toLowerCase()
  const keywords = extractKeywords(documentText)
  const candidateWords = extractKeywords(sentence)

  let score = 0
  candidateWords.forEach((word) => {
    if (keywords.includes(word)) {
      score += 2
    }
  })

  if (normalizedSentence.length > 80) score += 1
  if (/[0-9]/.test(normalizedSentence)) score += 1
  return score
}

export function buildAnswerFromDocument(documentText, question = '') {
  const text = normalizeWhitespace(documentText)

  if (!text) {
    return {
      answer: 'I could not establish a reliable answer because the uploaded document has no readable text.',
      verifiedQuotes: [],
      evidenceSummary: 'No extractable text available.',
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean)
  const questionWords = extractKeywords(question)

  let bestSentence = null
  let bestScore = 0

  sentences.forEach((sentence) => {
    const normalizedSentence = normalizeWhitespace(sentence)
    const sentenceWords = extractKeywords(normalizedSentence)
    let score = 0

    sentenceWords.forEach((word) => {
      if (questionWords.includes(word)) {
        score += 2
      }
    })

    if (questionWords.length === 0) score += 1

    if (normalizedSentence.length > 25 && score > bestScore) {
      bestScore = score
      bestSentence = normalizedSentence
    }
  })

  if (!bestSentence) {
    const fallback = sentences[0]
    if (fallback) {
      bestSentence = normalizeWhitespace(fallback)
    }
  }

  if (!bestSentence) {
    return {
      answer: 'I could not establish a reliable answer from the uploaded contract text. The document does not contain enough evidence for this question.',
      verifiedQuotes: [],
      evidenceSummary: 'No suitable passage found in the document text.',
    }
  }

  const verification = verifyQuote(text, bestSentence)
  const verifiedQuotes = verification.verified
    ? [{ quote: bestSentence, source: 'document-text', verified: true }]
    : []

  const answer = verification.verified
    ? `Based on the contract, ${bestSentence}`
    : 'I could not establish a reliable answer from the uploaded contract text. The document does not contain enough evidence for this question.'

  return {
    answer,
    verifiedQuotes,
    evidenceSummary: verification.verified ? 'Verified against the document text.' : 'No verified excerpt found for this answer.',
  }
}

export function splitClauses(documentText = '') {
  return normalizeWhitespace(documentText)
    .split(/(?<=[.])\s+(?=[A-Z0-9])/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

export function compareDocuments(documentA = '', documentB = '') {
  const clausesA = splitClauses(documentA)
  const clausesB = splitClauses(documentB)

  const normalizedA = clausesA.map((clause) => normalizeWhitespace(clause).toLowerCase())
  const normalizedB = clausesB.map((clause) => normalizeWhitespace(clause).toLowerCase())

  const added = clausesB.filter((clause) => {
    const normalizedClause = normalizeWhitespace(clause).toLowerCase()
    return !normalizedA.includes(normalizedClause)
  })

  const removed = clausesA.filter((clause) => {
    const normalizedClause = normalizeWhitespace(clause).toLowerCase()
    return !normalizedB.includes(normalizedClause)
  })

  const modified = clausesA.filter((clause, index) => {
    const normalizedClause = normalizeWhitespace(clause).toLowerCase()
    const similar = clausesB.find((comparison) => {
      const normalizedComparison = normalizeWhitespace(comparison).toLowerCase()
      const overlap = normalizedComparison.split(/\s+/).filter((word) => word.length > 3)
      const clauseWords = normalizedClause.split(/\s+/).filter((word) => word.length > 3)
      return overlap.some((word) => clauseWords.includes(word)) && normalizedComparison !== normalizedClause
    })

    return Boolean(similar) && index < clausesB.length
  })

  return {
    added,
    removed,
    modified,
    summary: {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
    },
  }
}
