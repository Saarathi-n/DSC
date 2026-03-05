import React from 'react';
import { ChatPage } from '../components/chat/ChatPage';

export const ChatView: React.FC = () => {
  const initialPrompt = sessionStorage.getItem('chat_initial_prompt') || undefined;
  if (initialPrompt) {
    sessionStorage.removeItem('chat_initial_prompt');
  }

  return <ChatPage initialPrompt={initialPrompt} />;
};
