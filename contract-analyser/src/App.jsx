import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileType2,
  Filter,
  FolderOpen,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { buildAnswerFromDocument, compareDocuments, verifyQuote } from './lib/verification.js'
import './App.css'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const STORAGE_KEY = 'clause-workspace-documents-v1'
const suggestedQuestions = [
  'What are the termination conditions?',
  'What is the liability cap?',
  'What are the payment terms?',
  'Which party has indemnification obligations?',
  'What governing law applies?',
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || ''
}

function buildDemoDocument() {
  const text = `Termination. Either party may terminate this Agreement for material breach if the defaulting party fails to cure within 10 days after written notice. Liability cap. The aggregate liability of either party shall not exceed AED 100,000 in any twelve-month period. Payment terms. Fees are due within 30 days of invoice. Indemnification. The Supplier shall indemnify the Customer for third-party claims arising from IP infringement and data breaches. Governing law. This Agreement shall be governed by the laws of the Emirate of Dubai, without regard to conflict of law rules.`

  const pages = [
    { pageNumber: 1, text: text },
    { pageNumber: 2, text: 'Annex A. Definitions and interpretation. The parties agree to the following usage.' },
  ]

  return {
    id: 'demo-contract',
    name: 'Demo Services Agreement',
    type: 'pdf',
    uploadedAt: new Date().toISOString(),
    status: 'ready',
    extractedText: text,
    pages,
    pageCount: pages.length,
    messages: [],
    error: '',
    isFixture: true,
  }
}

function loadDocuments() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    return [buildDemoDocument()]
  }

  try {
    const parsed = JSON.parse(saved)
    return parsed.length ? parsed : [buildDemoDocument()]
  } catch {
    return [buildDemoDocument()]
  }
}

function parsePdfText(file) {
  return file.arrayBuffer().then(async (buffer) => {
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
    const pages = []
    let mergedText = ''

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      pages.push({ pageNumber, text })
      if (text) {
        mergedText += `${text}\n\n`
      }
    }

    if (!mergedText.trim()) {
      throw new Error('This PDF appears to be scanned or contains no readable text. Please upload a searchable PDF or a DOCX file.')
    }

    return {
      extractedText: mergedText.trim(),
      pages,
      pageCount: pages.length,
    }
  })
}

async function parseUploadedFile(file) {
  const extension = fileExtension(file.name)

  if (extension === 'pdf') {
    return parsePdfText(file)
  }

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = (result.value || '').trim()

    if (!text) {
      throw new Error('This DOCX file has no readable text. Please upload a file with extractable content.')
    }

    return {
      extractedText: text,
      pages: [{ pageNumber: 1, text }],
      pageCount: 1,
    }
  }

  throw new Error('Unsupported file type. Please upload a PDF or DOCX document only.')
}

function findBestPageForQuote(document, quoteText) {
  if (!document || !quoteText) return 1

  const normalizedQuote = quoteText.trim()

  for (const page of document.pages || []) {
    if (verifyQuote(page.text || '', normalizedQuote).verified) {
      return page.pageNumber || 1
    }
  }

  const docMatch = verifyQuote(document.extractedText || '', normalizedQuote)
  if (docMatch.verified) {
    return 1
  }

  return 1
}

function App() {
  const [documents, setDocuments] = useState(() => loadDocuments())
  const [selectedDocumentId, setSelectedDocumentId] = useState(loadDocuments()[0]?.id || null)
  const [uploadError, setUploadError] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [viewerFocus, setViewerFocus] = useState(null)
  const [comparisonLeftId, setComparisonLeftId] = useState('')
  const [comparisonRightId, setComparisonRightId] = useState('')
  const [activeTab, setActiveTab] = useState('chat')
  const fileInputRef = useRef(null)
  const streamIntervalRef = useRef(null)

  useEffect(() => {
    const firstId = documents[0]?.id || null
    if (!selectedDocumentId && firstId) {
      setSelectedDocumentId(firstId)
    }
    if (!comparisonLeftId && documents[0]) {
      setComparisonLeftId(documents[0].id)
    }
    if (!comparisonRightId && documents[1]) {
      setComparisonRightId(documents[1].id)
    }
  }, [documents, selectedDocumentId, comparisonLeftId, comparisonRightId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents))
  }, [documents])

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || documents[0] || null,
    [documents, selectedDocumentId],
  )

  const comparisonLeft = useMemo(
    () => documents.find((document) => document.id === comparisonLeftId) || documents[0] || null,
    [documents, comparisonLeftId],
  )

  const comparisonRight = useMemo(
    () => documents.find((document) => document.id === comparisonRightId) || documents[1] || null,
    [documents, comparisonRightId],
  )

  const comparisonResult = useMemo(() => {
    if (!comparisonLeft || !comparisonRight) return null
    return compareDocuments(comparisonLeft.extractedText || '', comparisonRight.extractedText || '')
  }, [comparisonLeft, comparisonRight])

  const openCitation = (documentId, quoteText) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document) return

    setSelectedDocumentId(documentId)
    setActiveTab('chat')
    setViewerFocus({
      documentId,
      pageNumber: findBestPageForQuote(document, quoteText),
      quoteText,
    })
  }

  const stopGeneration = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }

    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== selectedDocumentId) return document
        const lastMessage = document.messages[document.messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.status !== 'streaming') {
          return document
        }

        return {
          ...document,
          messages: document.messages.map((message) =>
            message.id === lastMessage.id ? { ...message, status: 'final' } : message,
          ),
        }
      }),
    )
  }

  const streamAssistantReply = (documentId, messageId, answer) => {
    if (!answer || !answer.answer) return

    let index = 0
    const characters = answer.answer.split('')

    streamIntervalRef.current = setInterval(() => {
      index += 1
      setDocuments((current) =>
        current.map((document) => {
          if (document.id !== documentId) return document
          const messages = document.messages.map((message) => {
            if (message.id !== messageId) return message
            return {
              ...message,
              content: characters.slice(0, index).join(''),
              status: 'streaming',
            }
          })
          return { ...document, messages }
        }),
      )

      if (index >= characters.length) {
        clearInterval(streamIntervalRef.current)
        streamIntervalRef.current = null

        setDocuments((current) =>
          current.map((document) => {
            if (document.id !== documentId) return document
            const messages = document.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    status: 'final',
                    quotes: answer.verifiedQuotes || [],
                  }
                : message,
            )
            return { ...document, messages }
          }),
        )
      }
    }, 18)
  }

  const handleQuestionSubmit = (event) => {
    event.preventDefault()
    if (!selectedDocument || !chatInput.trim()) return

    const question = chatInput.trim()
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }
    const assistantMessageId = crypto.randomUUID()
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: new Date().toISOString(),
      quotes: [],
    }

    setChatInput('')

    setDocuments((current) =>
      current.map((document) =>
        document.id === selectedDocument.id
          ? { ...document, messages: [...document.messages, userMessage, assistantMessage] }
          : document,
      ),
    )

    const answer = buildAnswerFromDocument(selectedDocument.extractedText || '', question)
    streamAssistantReply(selectedDocument.id, assistantMessageId, answer)
  }

  const uploadDocuments = async (files) => {
    for (const file of files) {
      const extension = fileExtension(file.name)
      if (!['pdf', 'docx'].includes(extension)) {
        setUploadError('Unsupported file type. Please upload a PDF or DOCX only.')
        continue
      }

      const id = crypto.randomUUID()
      setDocuments((current) => [
        {
          id,
          name: file.name,
          type: extension,
          uploadedAt: new Date().toISOString(),
          status: 'processing',
          extractedText: '',
          pages: [],
          pageCount: 0,
          messages: [],
          error: '',
          isFixture: false,
        },
        ...current,
      ])

      setSelectedDocumentId(id)
      setActiveTab('overview')

      try {
        const parsed = await parseUploadedFile(file)
        setDocuments((current) =>
          current.map((document) =>
            document.id === id
              ? {
                  ...document,
                  status: 'ready',
                  extractedText: parsed.extractedText,
                  pages: parsed.pages,
                  pageCount: parsed.pageCount,
                  error: '',
                }
              : document,
          ),
        )
      } catch (error) {
        setDocuments((current) =>
          current.map((document) =>
            document.id === id
              ? {
                  ...document,
                  status: 'failed',
                  error: error.message,
                }
              : document,
          ),
        )
        setUploadError(error.message)
      }
    }
  }

  const handleFileSelection = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    await uploadDocuments(files)
    event.target.value = ''
  }

  const handleDeleteDocument = (documentId) => {
    setDocuments((current) => current.filter((document) => document.id !== documentId))
    if (selectedDocumentId === documentId) {
      const next = documents.find((document) => document.id !== documentId)
      setSelectedDocumentId(next?.id || null)
    }
  }

  return (
    <div className="workspace-shell">
      <aside className="sidebar-panel">
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <div>
            <p className="eyebrow">Legal workspace</p>
            <h1>Clause</h1>
          </div>
        </div>

        <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
          <Plus size={16} />
          New analysis
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileSelection}
          hidden
        />

        <div className="sidebar-section">
          <div className="section-label-row">
            <span>Documents</span>
            <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={14} />
            </button>
          </div>

          <div className="search-box">
            <Search size={14} />
            <input type="text" placeholder="Search documents" />
          </div>

          <div className="document-list">
            {documents.length === 0 ? (
              <div className="empty-inline">No documents</div>
            ) : (
              documents.map((document) => (
                <button
                  key={document.id}
                  className={`document-item ${selectedDocument?.id === document.id ? 'active' : ''}`}
                  onClick={() => setSelectedDocumentId(document.id)}
                >
                  <div className="document-item-main">
                    <div className="doc-badge">
                      {document.type === 'pdf' ? <FileText size={14} /> : <FileType2 size={14} />}
                    </div>
                    <div>
                      <strong>{document.name}</strong>
                      <small>{document.type.toUpperCase()} • {formatDate(document.uploadedAt)}</small>
                    </div>
                  </div>
                  <span className={`status-pill ${document.status}`}>{document.status}</span>
                  <span
                    className="delete-doc"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteDocument(document.id)
                    }}
                  >
                    <Trash2 size={12} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section compact">
          <div className="section-label-row">
            <span>Comparisons</span>
            <ChevronRight size={14} />
          </div>
        </div>

        <div className="sidebar-section compact">
          <div className="section-label-row">
            <span>Settings</span>
            <ChevronRight size={14} />
          </div>
        </div>
      </aside>

      <main className="content-panel">
        {selectedDocument ? (
          <>
            <header className="document-header">
              <div>
                <div className="header-row">
                  <span className="eyebrow">Contract</span>
                  <span className="status-pill ready">{selectedDocument.status}</span>
                </div>
                <h2>{selectedDocument.name}</h2>
              </div>

              <div className="meta-row">
                <span>{selectedDocument.type.toUpperCase()}</span>
                <span>{selectedDocument.pageCount || 1} pages</span>
                <span>{formatDate(selectedDocument.uploadedAt)}</span>
              </div>
            </header>

            <div className="tabs-row">
              <button
                className={activeTab === 'overview' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={activeTab === 'chat' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button
                className={activeTab === 'compare' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('compare')}
              >
                Compare
              </button>
            </div>

            {uploadError && <div className="notice danger">{uploadError}</div>}

            {activeTab === 'overview' && (
              <section className="overview-panel">
                <div className="overview-card">
                  <div className="summary-grid">
                    <div className="metric">
                      <span className="label">Document type</span>
                      <strong>{selectedDocument.type.toUpperCase()}</strong>
                    </div>
                    <div className="metric">
                      <span className="label">Pages</span>
                      <strong>{selectedDocument.pageCount || 1}</strong>
                    </div>
                    <div className="metric">
                      <span className="label">Uploaded</span>
                      <strong>{formatDate(selectedDocument.uploadedAt)}</strong>
                    </div>
                    <div className="metric">
                      <span className="label">Status</span>
                      <strong>{selectedDocument.status}</strong>
                    </div>
                  </div>
                </div>

                <div className="overview-card">
                  <h3>Onboarding</h3>
                  <ul className="checklist">
                    <li><CheckCheck size={15} /> Upload a PDF or DOCX contract</li>
                    <li><CheckCheck size={15} /> Ask a clause-specific question</li>
                    <li><CheckCheck size={15} /> Click a verified quote to jump to the relevant passage</li>
                  </ul>
                </div>
              </section>
            )}

            {activeTab === 'chat' && (
              <section className="chat-panel">
                <div className="chat-feed">
                  {selectedDocument.messages.length === 0 ? (
                    <div className="empty-state">
                      <MessageSquareText size={24} />
                      <h3>No chat yet</h3>
                      <p>Ask a question about the contract and verify the answer against document text.</p>
                    </div>
                  ) : (
                    selectedDocument.messages.map((message) => (
                      <div key={message.id} className={`chat-bubble ${message.role}`}>
                        <div className="bubble-header">
                          <span>{message.role === 'user' ? 'You' : 'Clause AI'}</span>
                          <small>{formatDate(message.timestamp)}</small>
                        </div>
                        <div className="bubble-body">
                          {message.content || 'Generating answer…'}
                        </div>
                        {message.role === 'assistant' && Array.isArray(message.quotes) && message.quotes.length > 0 && (
                          <div className="quote-list">
                            {message.quotes.map((quote, index) => (
                              <button
                                key={`${message.id}-${index}`}
                                className="quote-chip verified"
                                onClick={() => openCitation(selectedDocument.id, quote.quote)}
                              >
                                <ShieldCheck size={14} />
                                Verified quote
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="question-suggestions">
                  {suggestedQuestions.map((question) => (
                    <button key={question} className="suggestion" onClick={() => setChatInput(question)}>
                      {question}
                    </button>
                  ))}
                </div>

                <form className="composer" onSubmit={handleQuestionSubmit}>
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask a question about the uploaded agreement..."
                    rows={3}
                  />
                  <div className="composer-actions">
                    <button type="button" className="ghost-button danger" onClick={stopGeneration}>
                      Stop
                    </button>
                    <button type="submit" className="primary-button compact">
                      Ask Clause
                    </button>
                  </div>
                </form>
              </section>
            )}

            {activeTab === 'compare' && (
              <section className="compare-panel">
                <div className="compare-controls">
                  <label>
                    Original
                    <select value={comparisonLeftId} onChange={(event) => setComparisonLeftId(event.target.value)}>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>{document.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Revised
                    <select value={comparisonRightId} onChange={(event) => setComparisonRightId(event.target.value)}>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>{document.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {comparisonResult ? (
                  <div className="comparison-grid">
                    <div className="comparison-card">
                      <h3>Added clauses</h3>
                      {comparisonResult.added.length ? (
                        comparisonResult.added.map((clause, index) => (
                          <div key={`added-${index}`} className="clause-row positive">
                            <span className="pill added">Added</span>
                            <p>{clause}</p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">No notable additions.</p>
                      )}
                    </div>
                    <div className="comparison-card">
                      <h3>Removed clauses</h3>
                      {comparisonResult.removed.length ? (
                        comparisonResult.removed.map((clause, index) => (
                          <div key={`removed-${index}`} className="clause-row negative">
                            <span className="pill removed">Removed</span>
                            <p>{clause}</p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">No material removals.</p>
                      )}
                    </div>
                    <div className="comparison-card wide">
                      <h3>Substantive differences</h3>
                      {comparisonResult.modified.length ? (
                        comparisonResult.modified.map((clause, index) => (
                          <div key={`modified-${index}`} className="clause-row warning">
                            <span className="pill modified">Modified</span>
                            <p>{clause}</p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">No material clause rewrites detected.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <Filter size={20} />
                    <p>Select two versions to compare.</p>
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="empty-state large">
            <FolderOpen size={28} />
            <h3>No document selected</h3>
            <p>Upload a contract to begin analysis.</p>
            <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
              Upload contract
            </button>
          </div>
        )}
      </main>

      <aside className="viewer-panel">
        <div className="viewer-header">
          <div>
            <p className="eyebrow">Document viewer</p>
            <h3>{selectedDocument?.name || 'No document'}</h3>
          </div>
          <div className="viewer-actions">
            <button className="icon-button" aria-label="Previous page"><ChevronLeft size={14} /></button>
            <button className="icon-button" aria-label="Next page"><ChevronRight size={14} /></button>
          </div>
        </div>

        <div className="viewer-pages">
          {(selectedDocument?.pages && selectedDocument.pages.length > 0 ? selectedDocument.pages : [{ pageNumber: 1, text: selectedDocument?.extractedText || 'No text available yet.' }]).map((page) => (
            <article
              key={`page-${page.pageNumber}`}
              className={`page-card ${viewerFocus?.pageNumber === page.pageNumber ? 'highlighted' : ''}`}
            >
              <div className="page-header">
                <span>Page {page.pageNumber}</span>
                <ArrowUpRight size={14} />
              </div>
              <p>{page.text}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  )
}

export default App
