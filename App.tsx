import React, { useState, useEffect, useCallback } from 'react';
import { Book, Chapter, VoiceOption, ProcessingStatus, SyncState, SyncProvider } from './types.ts';
import { URDU_VOICES } from './constants.ts';
import { GeminiService } from './services/geminiService.ts';
import { SyncService } from './services/syncService.ts';
import Header from './components/Header.tsx';
import Library from './components/Library.tsx';
import Uploader from './components/Uploader.tsx';
import AudioPlayer from './components/AudioPlayer.tsx';
import SyncModal from './components/SyncModal.tsx';
import { 
  BookOpen, 
  PlusCircle, 
  Library as LibraryIcon, 
  ShieldCheck, 
  Loader2, 
  Settings2, 
  Cloud, 
  Play, 
  Pause, 
  Sparkles,
  Share2
} from 'lucide-react';

const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({
    provider: (localStorage.getItem('sync_provider') as SyncProvider) || 'public',
    roomId: localStorage.getItem('sync_room_id') || 'dastan_internal_shared_v2_9912',
    githubToken: localStorage.getItem('sync_github_token'),
    gistId: localStorage.getItem('sync_gist_id'),
    lastSynced: null,
    isSyncing: false
  });
  
  const [hasLoadedInitially, setHasLoadedInitially] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(URDU_VOICES[0]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [showUploader, setShowUploader] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Synchronize library with remote storage
  const refreshLibrary = useCallback(async (silent = false) => {
    if (!silent) setSyncState(prev => ({ ...prev, isSyncing: true }));
    
    try {
      let remoteBooks: Book[] | null = null;
      
      if (syncState.provider === 'github' && syncState.githubToken && syncState.gistId) {
        remoteBooks = await SyncService.pullFromGitHub(syncState.githubToken, syncState.gistId);
      } else if (syncState.provider === 'public') {
        remoteBooks = await SyncService.pullFromPublic(syncState.roomId || undefined);
      }

      if (remoteBooks) {
        setBooks(remoteBooks);
        setSyncState(prev => ({ ...prev, lastSynced: Date.now(), isSyncing: false }));
        setHasLoadedInitially(true);
      } else {
        setSyncState(prev => ({ ...prev, isSyncing: false }));
      }
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        console.warn("GitHub session expired or token revoked.");
        setSyncState(prev => ({ ...prev, provider: 'none', isSyncing: false }));
      }
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [syncState.provider, syncState.githubToken, syncState.gistId, syncState.roomId]);

  useEffect(() => {
    refreshLibrary();
    const interval = setInterval(() => refreshLibrary(true), 60000);
    return () => clearInterval(interval);
  }, [refreshLibrary]);

  // Update synchronization state and local storage
  const handleSyncUpdate = async (newState: Partial<SyncState>) => {
    const updated = { ...syncState, ...newState };
    setSyncState(updated);
    
    if (updated.provider) localStorage.setItem('sync_provider', updated.provider);
    if (updated.roomId) localStorage.setItem('sync_room_id', updated.roomId);
    if (updated.githubToken) localStorage.setItem('sync_github_token', updated.githubToken);
    else localStorage.removeItem('sync_github_token');
    if (updated.gistId) localStorage.setItem('sync_gist_id', updated.gistId);
    else localStorage.removeItem('sync_gist_id');

    setShowSyncModal(false);
    setHasLoadedInitially(false);
    // Force a pull after switching rooms
    setTimeout(() => refreshLibrary(), 100);
  };

  // Persist current library state to remote provider
  const persistLibrary = async (updatedBooks: Book[]) => {
    try {
      if (syncState.provider === 'github' && syncState.githubToken && syncState.gistId) {
        await SyncService.pushToGitHub(updatedBooks, syncState.githubToken, syncState.gistId);
      } else if (syncState.provider === 'public' && syncState.roomId) {
        await SyncService.pushToPublic(updatedBooks, syncState.roomId);
      }
      setSyncState(prev => ({ ...prev, lastSynced: Date.now() }));
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        alert("Sync failed: GitHub token invalid. Reconnecting...");
        setShowSyncModal(true);
      }
    }
  };

  // Remove a book from the library
  const handleDeleteBook = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("حذف کریں؟ (Are you sure you want to delete this?)")) return;
    const updatedBooks = books.filter(b => b.id !== id);
    setBooks(updatedBooks);
    if (selectedBook?.id === id) setSelectedBook(null);
    await persistLibrary(updatedBooks);
  };

  // Process and upload new manuscript content
  const handleUpload = async (input: { file?: File, text?: string, customTitle?: string }) => {
    setStatus(ProcessingStatus.EXTRACTING);
    try {
      const result = await GeminiService.extractAndSplitText(input.file || input.text!, !!input.file);
      
      const newBook: Book = {
        id: Date.now().toString(),
        title: input.customTitle || result.title || "Untitled Dastan",
        author: "Urdu Scholar",
        chapters: result.chapters.map((c, i) => ({
          id: `${Date.now()}-${i}`,
          title: c.title,
          text: c.text
        })),
        createdAt: Date.now()
      };

      const updatedBooks = [newBook, ...books];
      setBooks(updatedBooks);
      setShowUploader(false);
      setStatus(ProcessingStatus.IDLE);
      await persistLibrary(updatedBooks);
    } catch (err) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      alert("Failed to process the document. Please try again.");
    }
  };

  // Generate and play audio for a specific chapter
  const handleChapterPlay = async (chapter: Chapter) => {
    if (chapter.audioUrl) {
      setActiveChapter(chapter);
      return;
    }

    setStatus(ProcessingStatus.GENERATING_AUDIO);
    try {
      const audioUrl = await GeminiService.generateAudio(chapter.text, selectedVoice.modelVoice);
      
      // Update the local state
      const updatedBooks = books.map(b => {
        if (selectedBook && b.id === selectedBook.id) {
          const updatedChapters = b.chapters.map(c => 
            c.id === chapter.id ? { ...c, audioUrl } : c
          );
          const updatedBook = { ...b, chapters: updatedChapters };
          if (selectedBook.id === b.id) setSelectedBook(updatedBook);
          return updatedBook;
        }
        return b;
      });

      setBooks(updatedBooks);
      
      // Set the active chapter for the player
      const currentChapter = updatedBooks
        .find(b => selectedBook && b.id === selectedBook.id)
        ?.chapters.find(c => c.id === chapter.id);
      
      if (currentChapter) setActiveChapter(currentChapter);
      
      setStatus(ProcessingStatus.IDLE);
    } catch (err) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      alert("Failed to generate audio.");
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-300 selection:bg-[#d4af37]/30 selection:text-white">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-12 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Library & Controls */}
          <div className="lg:col-span-4 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#d4af37]/10 rounded-lg flex items-center justify-center border border-[#d4af37]/20">
                  <LibraryIcon className="text-[#d4af37]" size={18} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">Collection</h3>
              </div>
              <button 
                onClick={() => setShowUploader(true)}
                className="p-2 hover:bg-slate-900 rounded-lg text-[#d4af37] transition-all hover:scale-110"
              >
                <PlusCircle size={24} />
              </button>
            </div>

            <Library 
              books={books} 
              onSelectBook={setSelectedBook} 
              onDeleteBook={handleDeleteBook}
              selectedBookId={selectedBook?.id}
            />

            <div className="pt-8 border-t border-slate-900">
              <div className="flex items-center gap-3 mb-6">
                <Settings2 className="text-slate-600" size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Narration Engine</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {URDU_VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice)}
                    className={`text-right p-4 rounded-xl border transition-all ${
                      selectedVoice.id === voice.id
                        ? 'bg-slate-900 border-[#d4af37]/30 text-white'
                        : 'bg-black border-slate-900 text-slate-500 hover:border-slate-800'
                    }`}
                  >
                    <div className="font-bold text-sm mb-1">{voice.name}</div>
                    <div className="text-[10px] opacity-60 leading-relaxed">{voice.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-slate-900 space-y-3">
              <button 
                onClick={() => setShowSyncModal(true)}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${syncState.provider !== 'none' ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'bg-slate-900 text-slate-600'}`}>
                    <Cloud size={16} />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cloud Sync</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">
                      {syncState.provider === 'github' ? 'GitHub Gist active' : 
                       syncState.provider === 'public' ? `Room ${syncState.roomId}` : 
                       'Local only'}
                    </p>
                  </div>
                </div>
                {syncState.isSyncing ? (
                  <Loader2 className="animate-spin text-slate-600" size={14} />
                ) : (
                  <ShieldCheck className={syncState.lastSynced ? 'text-green-500/50' : 'text-slate-800'} size={14} />
                )}
              </button>

              <button 
                onClick={() => setShowSyncModal(true)}
                className="w-full p-3 rounded-lg border border-slate-900 hover:border-[#d4af37]/20 text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-center justify-center gap-2 hover:text-[#d4af37] transition-all"
              >
                <Share2 size={12} /> Share Library with a Friend
              </button>
            </div>
          </div>

          {/* Right Column: Content Viewer */}
          <div className="lg:col-span-8">
            {selectedBook ? (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4af37]/5 border border-[#d4af37]/10 text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    <Sparkles size={10} /> Reading Now
                  </div>
                  <h2 className="text-4xl md:text-6xl nastaliq text-white leading-relaxed">{selectedBook.title}</h2>
                  <div className="h-1 w-24 bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent mx-auto"></div>
                </div>

                <div className="space-y-6">
                  {selectedBook.chapters.map((chapter) => (
                    <div 
                      key={chapter.id}
                      className={`group p-6 md:p-8 rounded-2xl border transition-all ${
                        activeChapter?.id === chapter.id 
                        ? 'bg-slate-900/50 border-[#d4af37]/20' 
                        : 'bg-slate-950/50 border-slate-900 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row-reverse gap-6">
                        <div className="flex-1 text-right">
                          <h3 className="text-2xl nastaliq text-[#d4af37] mb-4">{chapter.title}</h3>
                          <p className="text-xl md:text-2xl nastaliq text-slate-200 leading-[2.5] md:leading-[3]">
                            {chapter.text}
                          </p>
                        </div>
                        <div className="md:w-12 flex items-start justify-center">
                          <button
                            onClick={() => handleChapterPlay(chapter)}
                            disabled={status === ProcessingStatus.GENERATING_AUDIO}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                              activeChapter?.id === chapter.id 
                                ? 'bg-[#d4af37] text-slate-950 shadow-lg scale-110' 
                                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            {status === ProcessingStatus.GENERATING_AUDIO && activeChapter?.id === chapter.id ? (
                              <Loader2 className="animate-spin" size={20} />
                            ) : activeChapter?.id === chapter.id ? (
                              <Pause size={24} />
                            ) : (
                              <Play size={24} className="ml-1" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12 bg-slate-950/30 rounded-[3rem] border border-dashed border-slate-900">
                <div className="w-24 h-24 bg-slate-900/50 rounded-full flex items-center justify-center mb-8 border border-slate-800">
                  <BookOpen className="text-slate-700" size={40} />
                </div>
                <h3 className="text-2xl md:text-3xl nastaliq text-slate-400 mb-4">داستانِ اردو میں خوش آمدید</h3>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-600 font-bold max-w-xs leading-relaxed">
                  Select a title from your library or upload a document to begin the journey
                </p>
                <button 
                  onClick={() => setShowUploader(true)}
                  className="mt-10 px-8 py-4 bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] rounded-full font-bold text-xs uppercase tracking-widest hover:bg-[#d4af37] hover:text-slate-950 transition-all flex items-center gap-3"
                >
                  <PlusCircle size={18} /> Add Your First Manuscript
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {showUploader && (
        <Uploader 
          onClose={() => setShowUploader(false)} 
          onSubmit={handleUpload}
          isLoading={status !== ProcessingStatus.IDLE && status !== ProcessingStatus.ERROR}
          status={status}
        />
      )}

      {showSyncModal && (
        <SyncModal 
          syncState={syncState} 
          onClose={() => setShowSyncModal(false)}
          onUpdate={handleSyncUpdate}
        />
      )}

      {activeChapter && (
        <AudioPlayer 
          chapter={activeChapter} 
          onClose={() => setActiveChapter(null)} 
        />
      )}

      <footer className="py-12 border-t border-slate-900 text-center">
        <p className="text-[10px] text-slate-700 font-bold uppercase tracking-[0.5em]">
          Dastan-e-Urdu &copy; {new Date().getFullYear()} &bull; Powered by Supernova
        </p>
      </footer>
    </div>
  );
};

export default App;