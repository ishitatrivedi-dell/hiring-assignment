import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWhitespace, verifyQuote, buildAnswerFromDocument } from './verification.js'

test('normalizeWhitespace collapses line breaks without changing words', () => {
  const text = 'The Parties\n agree to  pay  a fee.\n\nThe fee is due.'
  assert.equal(normalizeWhitespace(text), 'The Parties agree to pay a fee. The fee is due.')
})

test('verifyQuote accepts a repeated quote within the document', () => {
  const documentText = 'Termination may occur for cause.\nTermination may occur for cause.\nThe parties agree.'
  const quote = 'Termination may occur for cause.'
  const result = verifyQuote(documentText, quote)
  assert.equal(result.verified, true)
  assert.equal(result.occurrences.length, 2)
})

test('verifyQuote rejects a quote that is not in the document', () => {
  const documentText = 'Governing law is New York law.'
  const quote = 'Governing law is Delaware law.'
  const result = verifyQuote(documentText, quote)
  assert.equal(result.verified, false)
  assert.equal(result.occurrences.length, 0)
})

test('buildAnswerFromDocument responds with evidence when the text contains the answer', () => {
  const documentText = 'Liability cap is capped at AED 100,000.\nThe parties shall indemnify each other.'
  const answer = buildAnswerFromDocument(documentText, 'What is the liability cap?')
  assert.equal(answer.verifiedQuotes.length > 0, true)
  assert.equal(answer.answer.includes('AED 100,000') || answer.answer.includes('liability cap'), true)
})
