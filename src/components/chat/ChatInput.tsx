"use client";
import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';

const POPULAR_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '🎉', '✅', '🙏', '💯', '🚀', '⭐', '👀', '🤝', '💡', '✨'];

export function ChatInput() {
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const { activeChannel, sendMessage, socket } = useChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleSend = () => {
    if (!content.trim() || !activeChannel) return;
    sendMessage(activeChannel.id, content.trim());
    setContent("");
    setShowEmojis(false);
    
    socket?.emit('typing:stop', { channelId: activeChannel.id });
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;

    if (e.target.value.length > 0) {
      socket?.emit('typing:start', { channelId: activeChannel?.id });
    } else {
      socket?.emit('typing:stop', { channelId: activeChannel?.id });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, forceType?: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file || !activeChannel) return;

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${activeChannel.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const type = forceType || (file.type.startsWith('image/') ? 'image' : 'file');
      sendMessage(activeChannel.id, file.name, type, publicUrl);
      
      toast.success("File uploaded");
    } catch (err: any) {
      console.error("Upload Error:", err);
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addEmoji = (emoji: string) => {
    setContent(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (!activeChannel) return null;

  return (
    <div className="p-4 bg-[#f8f7f4] border-t border-[#eceae4] relative">
      {/* Emoji Picker Popover */}
      {showEmojis && (
        <div className="absolute bottom-full left-4 mb-2 p-2 bg-white border border-[#eceae4] rounded-2xl shadow-xl flex flex-wrap gap-1 max-w-[200px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {POPULAR_EMOJIS.map(emoji => (
            <button 
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="w-8 h-8 flex items-center justify-center hover:bg-[#eceae4] rounded-lg transition-colors text-lg"
            >
              {emoji}
            </button>
          ))}
          <div className="w-full h-px bg-[#eceae4] my-1" />
          <button 
            onClick={() => setShowEmojis(false)}
            className="w-full py-1 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest hover:text-[#1c1c1c]"
          >
            Close
          </button>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => handleFileUpload(e)}
      />

      <div className="max-w-4xl mx-auto flex items-end gap-3 bg-white border border-[#eceae4] rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-[#1c1c1c]/5 transition-all">
        <div className="flex items-center gap-1 pb-1">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = "image/*";
                fileInputRef.current.click();
              }
            }}
            disabled={uploading}
            className="p-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg transition-colors disabled:opacity-50"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>

        <textarea
          ref={inputRef}
          rows={1}
          placeholder={`Message ${activeChannel.name}...`}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-1 resize-none min-h-[40px] max-h-[150px] placeholder:text-[#5f5f5d]/50"
          value={content}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center gap-1 pb-1">
          <button 
            onClick={() => setShowEmojis(!showEmojis)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showEmojis ? "bg-[#eceae4] text-[#1c1c1c]" : "text-[#5f5f5d] hover:bg-[#eceae4]"
            )}
          >
            <Smile className="w-4 h-4" />
          </button>
          <button 
            onClick={handleSend}
            disabled={!content.trim() && !uploading}
            className={cn(
              "p-2.5 rounded-xl transition-all shadow-lg shadow-[#1c1c1c]/10",
              content.trim() 
                ? "bg-[#1c1c1c] text-[#fcfbf8] hover:scale-105 active:scale-95" 
                : "bg-[#eceae4] text-[#5f5f5d] cursor-not-allowed opacity-50"
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 mt-1.5 flex items-center gap-2">
        <p className="text-[10px] text-[#5f5f5d] font-medium opacity-40">
          <span className="font-bold">Shift + Enter</span> for new line
        </p>
      </div>
    </div>
  );
}
