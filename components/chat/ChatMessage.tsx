import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType, AgentStep, ActivityRef } from '../../lib/chatTypes';
import { formatTime } from '../../lib/chatUtils';
import {
    ChevronDown,
    ChevronRight,
    Wrench,
    Music,
    Monitor,
    Clock,
    Brain,
} from 'lucide-react';

interface ChatMessageProps {
    message: ChatMessageType;
    isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
    const [showSteps, setShowSteps] = useState(false);
    const [displayedText, setDisplayedText] = useState('');
    const isUser = message.role === 'user';
    const hasSteps = message.tool_calls && message.tool_calls.length > 0;
    const hasActivities = message.activities && message.activities.length > 0;
    const { answerText, thinkingText } = splitThinkingContent(message.content);
    const hasThinking = !isUser && thinkingText.length > 0;
    const rawAssistant = isUser ? message.content : cleanAssistantContent(answerText || message.content);
    const bubbleText = isUser ? rawAssistant : stripLeadingChainOfThought(rawAssistant).trim();

    useEffect(() => {
        if (!isStreaming || isUser) {
            setDisplayedText(bubbleText);
            return;
        }

        const timer = window.setInterval(() => {
            setDisplayedText((prev) => {
                if (!bubbleText.startsWith(prev)) return bubbleText;
                if (prev.length >= bubbleText.length) return prev;
                return bubbleText.slice(0, prev.length + 1);
            });
        }, 8);

        return () => window.clearInterval(timer);
    }, [bubbleText, isStreaming, isUser]);

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-1'}`}>
                {/* Thinking badge — collapsed, no raw content shown */}
                {hasThinking && (
                    <div className="mt-1 mb-1 flex items-center gap-1.5 text-xs text-gray-500">
                        <Brain className="w-3 h-3" />
                        <span>Thought through the answer</span>
                    </div>
                )}

                {/* Message bubble */}
                <div
                    className={`rounded-2xl px-4 py-3 mt-2 ${isUser
                        ? 'bg-cyan-600 text-white rounded-br-md'
                        : 'bg-white/5 text-gray-100 rounded-bl-md border border-[#333]'
                        }`}
                >
                    <MarkdownMessage text={isStreaming && !isUser ? displayedText : bubbleText} />
                    {isStreaming && !isUser && (
                        <span className="inline-block w-[6px] h-[1em] ml-0.5 align-[-2px] bg-gray-300 animate-pulse" />
                    )}
                </div>

                {/* Agent steps toggle */}
                {hasSteps && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowSteps(!showSteps)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                        >
                            {showSteps ? (
                                <ChevronDown className="w-3 h-3" />
                            ) : (
                                <ChevronRight className="w-3 h-3" />
                            )}
                            <Brain className="w-3 h-3" />
                            <span>{message.tool_calls!.length} agent step{message.tool_calls!.length > 1 ? 's' : ''}</span>
                        </button>

                        {showSteps && (
                            <div className="mt-2 space-y-2">
                                {message.tool_calls!.map((step, i) => (
                                    <AgentStepCard key={i} step={step} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Activity references */}
                {hasActivities && (
                    <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Referenced Activities</p>
                        <div className="flex flex-wrap gap-2">
                            {message.activities!.slice(0, 8).map((act, i) => (
                                <ActivityCard key={i} activity={act} />
                            ))}
                            {message.activities!.length > 8 && (
                                <span className="text-xs text-gray-500 self-center">
                                    +{message.activities!.length - 8} more
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Timestamp */}
                <p className={`text-[10px] mt-1 ${isUser ? 'text-right text-cyan-300' : 'text-gray-500'}`}>
                    {formatTime(message.created_at)}
                </p>
            </div>
        </div>
    );
}

function MarkdownMessage({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({ children }) => <h1 className="text-base font-semibold mt-2 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold mt-2 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                h4: ({ children }) => <h4 className="text-sm font-medium mt-1 mb-1">{children}</h4>,
                h5: ({ children }) => <h5 className="text-sm font-medium mt-1 mb-1">{children}</h5>,
                h6: ({ children }) => <h6 className="text-sm font-medium mt-1 mb-1">{children}</h6>,
                p: ({ children }) => <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 text-sm my-1 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 text-sm my-1 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="text-cyan-300 underline hover:text-cyan-200">
                        {children}
                    </a>
                ),
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ className, children, ...props }) => {
                    const isBlock = !!className;
                    const lang = className?.replace('language-', '') ?? '';
                    if (isBlock) {
                        return (
                            <code className="block text-xs text-gray-100 whitespace-pre-wrap" data-lang={lang} {...props as object}>
                                {children}
                            </code>
                        );
                    }
                    return (
                        <code className="px-1 py-0.5 rounded bg-[#161616]/80 border border-[#333]/50 text-xs text-green-300 font-mono" {...props as object}>
                            {children}
                        </code>
                    );
                },
                pre: ({ children }) => (
                    <div className="relative my-2 group">
                        <pre className="text-xs bg-[#0a0a0a] border border-[#333]/70 rounded-lg p-3.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            {children}
                        </pre>
                    </div>
                ),
                table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-xs border border-[#333] rounded overflow-hidden">{children}</table>
                    </div>
                ),
                thead: ({ children }) => <thead className="bg-[#161616]">{children}</thead>,
                th: ({ children }) => <th className="px-2 py-1 text-left border-b border-[#333] font-semibold text-white">{children}</th>,
                td: ({ children }) => <td className="px-2 py-1 align-top border-b border-[#262626] text-gray-200">{children}</td>,
                blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[#444] pl-3 italic text-gray-300 my-2">{children}</blockquote>
                ),
                hr: () => <hr className="border-[#333] my-3" />,
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

function cleanAssistantContent(content: string): string {
    // Step 1: strip [Agent] status lines
    let text = content.replace(/^\[Agent\].*/gim, '');

    // Step 2: strip <tool_call> / <tool_response> XML blocks
    text = text
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, '');

    // Step 3: extractAnswerTail — find text after the last closed JSON tool-call block
    const tail = extractAnswerTailFromContent(text);
    if (tail.trim()) {
        text = tail;
    } else {
        // No clear tail — run full stripToolJsonPayloads on the whole thing
        text = stripToolJsonPayloads(text);
    }

    // Step 4: strip any remaining model-specific delimiters and reasoning JSON fields
    text = stripReasoningLeaks(text);

    // Step 5: strip <AnswerAnswer: ...> style doubled tag artifacts
    text = text.replace(/<th\*{0,4}Answer[^>]*>/gi, '').replace(/<\/th>/gi, '');

    // Step 6: collapse excessive blank lines
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
}

/** Finds text appearing after the last complete {"tool":...} JSON block in content. */
function extractAnswerTailFromContent(content: string): string {
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastClosedAt = -1;
    let foundToolBlock = false;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') { depth++; continue; }
        if (ch === '}') {
            if (depth > 0) {
                depth--;
                if (depth === 0) {
                    // Only treat as a tool block if it contained "tool" key
                    const block = content.slice(content.lastIndexOf('{', i), i + 1);
                    if (block.includes('"tool"') || block.includes('"args"')) {
                        foundToolBlock = true;
                        lastClosedAt = i;
                    }
                }
            }
            continue;
        }
    }

    if (!foundToolBlock || lastClosedAt < 0) return '';
    return content.slice(lastClosedAt + 1).replace(/^[\s,\[\]]+/, '').trim();
}

function splitThinkingContent(content: string): { answerText: string; thinkingText: string } {
    let answerText = content;
    let thinkingText = '';

    const thinkRegex = /<think[^>]*>([\s\S]*?)<\/think>/gi;
    let match;

    while ((match = thinkRegex.exec(content)) !== null) {
        thinkingText += match[1] + '\n';
        answerText = answerText.replace(match[0], '');
    }

    const unclosedThinkRegex = /<think[^>]*>([\s\S]*)$/i;
    const unclosedMatch = unclosedThinkRegex.exec(answerText);
    if (unclosedMatch) {
        thinkingText += unclosedMatch[1] + '\n';
        answerText = answerText.replace(unclosedMatch[0], '');
    }

    return {
        answerText: stripToolJsonPayloads(answerText).trim(),
        thinkingText: sanitizeThinkingText(thinkingText.trim()),
    };
}

function sanitizeThinkingText(raw: string): string {
    // Strip [TOOL_CALL] markers, <tool_call> blocks, [Agent] status lines
    let text = raw
        .replace(/\[TOOL_CALL[^\]]*\][\s\S]*/gi, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, '')
        .replace(/^\[Agent\].*/gim, '')
        .trim();
    if (!text) return '';

    // If the text contains tool-call JSON patterns (even malformed/partial), suppress it
    const looksLikeToolJson =
        (text.includes('"tool"') || text.includes('"tool":')) &&
        (text.includes('"args"') || text.includes('"args":'));
    // Also catch partial streaming JSON that starts with { or has bare key fragments
    const looksLikeRawJson =
        /^\s*\{/.test(text) && (text.includes('"tool') || text.includes('"args'));
    if (looksLikeToolJson || looksLikeRawJson) {
        // Try to salvage a reasoning field if present
        const reasoningMatch = text.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (reasoningMatch?.[1]?.trim()) return reasoningMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
        return '';
    }

    // Try full JSON parse as last resort
    const candidate = extractJsonObject(text) || text;
    try {
        const parsed = JSON.parse(candidate) as { tool?: string; args?: unknown; reasoning?: string };
        if (parsed && typeof parsed === 'object' && parsed.tool && parsed.args) {
            if (typeof parsed.reasoning === 'string' && parsed.reasoning.trim()) {
                return parsed.reasoning.trim();
            }
            return '';
        }
    } catch { }

    const compact = text.replace(/\bThinking\.\.\.\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
    if (!compact) return '';
    const lower = compact.toLowerCase();
    const looksInternal =
        lower.includes('the user ') || lower.includes('user says') ||
        lower.includes('i should') || lower.includes('let me ') ||
        lower.includes('likely they') || lower.includes('we need to') ||
        lower.includes('then we') || lower.includes('let\'s call') ||
        lower.includes('tool output') || lower.includes('call get_') ||
        lower.includes('reasoning models');
    if (looksInternal) return 'Analyzing your request and checking the relevant activity data.';
    const firstSentence = compact.split(/(?<=[.!?])\s+/)[0]?.trim() || compact;
    return firstSentence.slice(0, 180);
}

function extractJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return null;
}

function stripToolJsonPayloads(text: string): string {
    let result = text;
    result = result.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, (match, content) => {
        if (content.includes('"tool"') && content.includes('"args"')) return '';
        return match;
    });

    let cleaned = '';
    let depth = 0;
    let startIdx = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < result.length; i++) {
        const char = result[i];
        if (inString) {
            if (escape) { escape = false; }
            else if (char === '\\') { escape = true; }
            else if (char === '"') { inString = false; }
            continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') {
            if (depth === 0) { cleaned += result.slice(startIdx, i); startIdx = i; }
            depth++;
            continue;
        }
        if (char === '}') {
            if (depth > 0) {
                depth--;
                if (depth === 0) {
                    const objStr = result.slice(startIdx, i + 1);
                    if (!(objStr.includes('"tool"') && objStr.includes('"args"'))) cleaned += objStr;
                    startIdx = i + 1;
                }
            }
            continue;
        }
    }

    if (startIdx < result.length) {
        const leftover = result.slice(startIdx);
        if (!(depth > 0 && leftover.includes('"tool"'))) cleaned += leftover;
    }

    result = cleaned;
    result = result.replace(/^[\s\[\],]+$/g, '');
    result = result.replace(/\[\s*(?:,\s*)*\]/g, '');
    result = result.replace(/,\s*(?=\])/g, '');
    result = result.replace(/^,\s*/g, '');

    return result
        .replace(/<\|tool_calls_section_begin\|>/gi, '')
        .replace(/<\|tool_calls_section_end\|>/gi, '')
        .replace(/<\|tool_call_begin\|>/gi, '')
        .replace(/<\|tool_call_end\|>/gi, '')
        .replace(/<\|tool_call_argument_begin\|>/gi, '')
        .replace(/\[\[IF_ACTION:\{[\s\S]*?\}\]\]/gi, '')
        .replace(/<think[^>]*>/gi, '')
        .replace(/<\/think>/gi, '')
        // Strip [TOOL_CALL ...] markers and everything after on the same line
        .replace(/\[TOOL_CALL[^\]]*\].*/gim, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function stripReasoningLeaks(text: string): string {
    let result = text;
    result = result.replace(/,?\s*"reasoning"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}?/gs, '');
    result = result.replace(/^\s*,\s*"[a-zA-Z_]+"\s*:\s*(?:"[^"]*"|true|false|\d+)\s*\}?\s*$/gm, '');
    result = result.replace(/^\s*\}\s*$/gm, '');
    result = result.replace(/<\|(?:tool_calls?|function)[^|]*\|>/gi, '');
    result = result.replace(/\n{3,}/g, '\n\n');
    // Strip inline chain-of-thought reasoning that leaked without <think> tags
    result = stripLeadingChainOfThought(result);
    return result.trim();
}

function stripLeadingChainOfThought(text: string): string {
    const sentenceReasoningPatterns = [
        /^the user (just |has )?(said|says|asked|wants|is |sent)/i,
        /^no (question|tool calls?|function calls?|action)\b/i,
        /^(we|i) should (respond|reply|say|answer|just)/i,
        /^this (is a simple|is straightforward|requires? no|is not a)/i,
        /^let me (think|consider|check|look)/i,
        /^since (the user|there|no )/i,
        /^(there are no|there's no) (tool calls?|function calls?|question)/i,
        /^simply (respond|reply|say)/i,
        /^just (respond|reply|say|answer)/i,
        /^no need to (call|use|invoke)/i,
        /^(this doesn't?|it doesn't?) (require|need)/i,
    ];

    // Paragraph-level reasoning patterns — whole paragraphs that are internal monologue
    const paragraphReasoningPatterns = [
        /^(we|i) (have|found|see|can see|note|know|checked|searched)/i,
        /^(we|i) should/i,
        /^(we|i) (need|want|will|must)/i,
        /^the (evidence|data|result|ocr|activity|context|snippet|search)/i,
        /^(looking|searching|checking|scanning|analyzing|reviewing) /i,
        /^provide (evidence|a bullet|the bullet|an answer)/i,
        /^also (note|remember|verify|check)/i,
        /^(so|therefore|thus),? (we|i|the answer|it)/i,
        /^thus (answer|the answer|we can)/i,
        /^entry \d/i,
        /^(relevant|strong|high) (evidence|confidence|match)/i,
        /^based on (the|this|our|that)/i,
        /^(it (seems|looks|appears)|this means|this indicates)/i,
        /^let('?s| me) (also|now|check|verify|look)/i,
    ];

    // Strip paragraph blocks of reasoning (separated by \n\n)
    const paragraphs = text.split(/\n{2,}/);
    let stripParaUntil = 0;
    for (let i = 0; i < paragraphs.length - 1; i++) {
        const para = paragraphs[i].trim();
        if (paragraphReasoningPatterns.some((p) => p.test(para))) {
            stripParaUntil = i + 1;
        } else {
            break;
        }
    }
    let result = stripParaUntil > 0
        ? paragraphs.slice(stripParaUntil).join('\n\n').trim()
        : text;

    // Strip "Thus answer." / "So the answer is:" prefixes before the real answer
    result = result.replace(/^(?:thus answer[.:!]?|so(?:,| the)? answer(?:\s*is)?[.:!]?)\s*/i, '');

    // Strip leading sentences that look like reasoning (single-sentence leaks)
    const parts = result.split(/(?<=[.!?]) *(?=[A-Z*\[#\n])/);
    let stripUntil = 0;
    for (let i = 0; i < parts.length - 1; i++) {
        const sentence = parts[i].trim();
        if (sentenceReasoningPatterns.some((p) => p.test(sentence))) {
            stripUntil = i + 1;
        } else {
            break;
        }
    }
    if (stripUntil > 0) {
        result = parts.slice(stripUntil).join(' ').trim();
    }

    return result;
}

function AgentStepCard({ step }: { step: AgentStep }) {
    const [expanded, setExpanded] = useState(false);

    const toolIcon = () => {
        switch (step.tool_name) {
            case 'query_activities': return <Clock className="w-3.5 h-3.5 text-blue-400" />;
            case 'search_ocr': return <Monitor className="w-3.5 h-3.5 text-green-400" />;
            case 'get_usage_stats': return <Wrench className="w-3.5 h-3.5 text-yellow-400" />;
            default: return <Wrench className="w-3.5 h-3.5 text-gray-400" />;
        }
    };

    const toolLabel = () => {
        switch (step.tool_name) {
            case 'query_activities': return 'Queried Activities';
            case 'search_ocr': return 'Searched Screen Text';
            case 'get_usage_stats': return 'Fetched Usage Stats';
            default: return step.tool_name;
        }
    };

    const resultSummary = () => {
        try {
            const data = JSON.parse(step.tool_result);
            if (Array.isArray(data)) return `${data.length} result${data.length !== 1 ? 's' : ''}`;
            return 'Data received';
        } catch {
            return step.tool_result.length > 100 ? `${step.tool_result.substring(0, 100)}...` : step.tool_result;
        }
    };

    return (
        <div className="bg-[#161616] border border-[#333] rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-gray-300">
                        {step.turn}
                    </div>
                    {toolIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-200">{toolLabel()}</span>
                    <span className="text-[10px] text-gray-500 ml-2">→ {resultSummary()}</span>
                </div>
                {expanded ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />}
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-[#333]">
                    {step.reasoning && (
                        <div className="mt-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Reasoning</p>
                            <p className="text-xs text-gray-300 italic">{step.reasoning}</p>
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Arguments</p>
                        <pre className="text-[11px] text-gray-300 bg-[#0a0a0a] rounded p-2 overflow-x-auto">
                            {JSON.stringify(step.tool_args, null, 2)}
                        </pre>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Result</p>
                        <pre className="text-[11px] text-gray-300 bg-[#0a0a0a] rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                            {(() => {
                                try { return JSON.stringify(JSON.parse(step.tool_result), null, 2); }
                                catch { return step.tool_result; }
                            })()}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function ActivityCard({ activity }: { activity: ActivityRef }) {
    const hasMedia = activity.media && activity.media.title;
    return (
        <div className="flex items-center gap-2 bg-white/5 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-white/10 transition-colors cursor-pointer">
            {hasMedia ? (
                <Music className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            ) : (
                <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            )}
            <div className="min-w-0">
                <p className="text-xs text-gray-200 font-medium truncate max-w-[200px]">
                    {hasMedia
                        ? `${activity.media!.title} – ${activity.media!.artist}`
                        : activity.title || activity.app}
                </p>
                <p className="text-[10px] text-gray-500">
                    {activity.app} · {formatTime(activity.time)}
                </p>
            </div>
        </div>
    );
}
