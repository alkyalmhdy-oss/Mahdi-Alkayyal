/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, signIn, logOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  deleteDoc,
  where
} from 'firebase/firestore';
import { 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  PieChart,
  Menu,
  X,
  Sun,
  Moon,
  ShieldAlert,
  Target,
  Skull,
  Compass,
  Bell,
  MapPin,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Group } from './types';

// Components
import Dashboard from './components/Dashboard';
import GroupView from './components/GroupView';
import CreateGroupModal from './components/CreateGroupModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dataDeletedPopup, setDataDeletedPopup] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    (window as any).openCreateGroupModal = () => setIsCreateModalOpen(true);
    return () => {
      delete (window as any).openCreateGroupModal;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has seen welcome popup
        const hasSeenWelcome = localStorage.getItem(`hasSeenWelcome_${currentUser.uid}`);
        if (!hasSeenWelcome) {
          setShowWelcomePopup(true);
        }

        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            console.error("Error creating user profile:", error);
          }
        } else {
          const data = userSnap.data();
          const createdAt = data.createdAt?.toDate();
          if (createdAt && (Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000)) {
            try {
              // Delete all groups created by this user
              console.log("Checking for demo data reset...");
              const groupsQuery = query(collection(db, 'groups'), where('memberIds', 'array-contains', currentUser.uid));
              const groupsSnap = await getDocs(groupsQuery);
              for (const groupDoc of groupsSnap.docs) {
                if (groupDoc.data().createdBy === currentUser.uid) {
                  await deleteDoc(doc(db, 'groups', groupDoc.id));
                }
              }
              // Reset their createdAt
              await setDoc(userRef, {
                ...data,
                createdAt: serverTimestamp(),
              });
              // Show popup
              setDataDeletedPopup(true);
            } catch (error) {
              console.error("Error resetting demo data:", error);
            }
          }
        }

        // Test connection
        try {
          const { getDocFromServer } = await import('firebase/firestore');
          await getDocFromServer(doc(db, 'users', currentUser.uid));
        } catch (error) {
          if (error instanceof Error && error.message.includes('offline')) {
            console.error("Firestore connection failed: client is offline");
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }

    const groupsQuery = query(
      collection(db, 'groups'),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      setLastError(null);
      const fetchedGroups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Group));
      setGroups(fetchedGroups);
    }, (error) => {
      console.error("Error fetching groups:", error);
      setLastError(error.message);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (selectedGroupId && !groups.find(g => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 transition-colors duration-300">
        <div className="text-center">
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-zinc-400 font-bold text-sm tracking-widest font-display animate-pulse">جاري تحميل المنصة المركزية PMAC...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 p-4 text-center relative overflow-hidden transition-colors duration-300 select-none" style={{ direction: 'rtl' }}>
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-emerald-700/10 rounded-full blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-red-700/10 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full bg-zinc-900 border border-zinc-800 p-8 sm:p-12 rounded-[40px] shadow-2xl relative z-10 text-right"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-600 to-green-600 rounded-[30px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-950/20">
            <ShieldAlert className="w-12 h-12 text-white" />
          </div>
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-900 px-3 py-1 rounded-full uppercase tracking-widest">النظام الموحد لغرفة العمليات</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-4 text-white font-display">المركز الفلسطيني لإزالة الألغام</h1>
            <p className="text-emerald-500 font-medium text-sm mt-1">Palestinian Mine Action Center (PMAC)</p>
          </div>
          <p className="text-zinc-400 mb-8 leading-relaxed text-sm text-center">
            بوابة الإشراف الميداني وتنسيق شؤون الألغام وإدارة التقارير الميدانية والتوعوية بالتعاون مع لجان السلامة ووزارة الداخلية والبلديات الفلسطينية.
          </p>
          <button
            onClick={signIn}
            className="w-full py-4 bg-white text-zinc-950 hover:bg-zinc-100 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-4 shadow-xl shadow-white/5 text-base outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-6 h-6 bg-white rounded-full p-0.5 shrink-0" />
            الدخول الآمن بواسطة حساب Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans relative overflow-hidden transition-colors duration-300 selection:bg-emerald-800 selection:text-white" style={{ direction: 'rtl' }}>
      {/* Debug Overlay */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-4 left-4 z-[100] bg-black/90 text-white p-4 rounded-2xl text-[10px] font-mono max-w-xs pointer-events-none text-right border border-zinc-800 print:hidden">
          <p className="font-bold mb-1 text-emerald-400 font-display">بيانات غرفة التحكم</p>
          <p>القطاعات النشطة: {groups.length}</p>
          <p>المعرّف الرقمي: {user.uid.slice(0, 8)}...</p>
          {lastError && <p className="text-red-400 mt-2">خلل: {lastError}</p>}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-40 lg:hidden print:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 right-0 w-76 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar print:hidden
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Decorative branding glow */}
        <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -right-24 w-62 h-62 bg-emerald-600 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -left-32 w-62 h-62 bg-red-600 rounded-full blur-[100px]" />
        </div>

        <div className="p-6 relative z-10 shrink-0 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-sm font-extrabold text-zinc-900 dark:text-white font-display">المركز الفلسطيني PMAC</span>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">لإزالة الألغام والمخلفات</span>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="space-y-1.5">
            <button 
              onClick={() => {
                setSelectedGroupId(null);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-right ${!selectedGroupId ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 font-bold' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              <span className="text-sm">غرفة التحكم المركزية</span>
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 relative z-10 custom-scrollbar min-h-[220px]">
          <div className="flex items-center justify-between px-3 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">القطاعات الميدانية الجارية</span>
            <button 
              onClick={() => {
                setIsCreateModalOpen(true);
                setIsSidebarOpen(false);
              }}
              className="p-1.5 bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
              title="تأسيس قطاع جديد"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 text-right group ${selectedGroupId === group.id ? 'bg-zinc-900 dark:bg-zinc-800 text-white shadow-md' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${group.type === 'personal' ? 'bg-red-500' : group.type === 'trip' ? 'bg-amber-500' : group.type === 'household' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                  <span className="truncate text-sm font-bold">{group.name}</span>
                </div>
                {selectedGroupId === group.id ? (
                  <ChevronLeft className="w-4 h-4 shrink-0 opacity-70" />
                ) : (
                  <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 text-zinc-400 transition-opacity">تصفح</span>
                )}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <MapPin className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">لا توجد قطاعات مسجلة حالياً</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 mt-auto relative z-10 shrink-0 border-t border-zinc-100 dark:border-zinc-800">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl mb-4 text-right">
            <div className="flex items-center gap-3">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=0D9488&color=ffffff`} alt="" className="w-10 h-10 rounded-xl" />
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs font-black text-zinc-950 dark:text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate font-mono">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={logOut}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-red-500/10 hover:bg-red-500/100 text-red-600 hover:text-white rounded-xl transition-all duration-300 font-bold text-xs"
            >
              <LogOut className="w-4 h-4" />
              تسجيل خروج
            </button>
            <button 
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300"
              title={theme === 'dark' ? 'التحول للمظهر المضيء' : 'التحول للمظهر المظلم'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-zinc-50 dark:bg-zinc-950 text-right print:bg-white print:p-0 print:overflow-visible">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-30 print:hidden">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-display text-sm">المركز الفلسطيني لإزالة الألغام</span>
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!selectedGroupId ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-6 sm:p-10 max-w-7xl mx-auto"
            >
              <Dashboard 
                user={user} 
                groups={groups} 
                onSelectGroup={(id) => {
                  setSelectedGroupId(id);
                  setIsSidebarOpen(false);
                }}
                theme={theme}
              />
            </motion.div>
          ) : (
            <motion.div
              key={selectedGroupId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-6 sm:p-10 max-w-7xl mx-auto"
            >
              <GroupView 
                groupId={selectedGroupId} 
                user={user} 
                onBack={() => setSelectedGroupId(null)} 
                theme={theme}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {dataDeletedPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setDataDeletedPopup(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[40px] shadow-2xl p-8 sm:p-10 text-center text-white"
            >
              <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-emerald-400 border border-emerald-500/20">
                <Settings className="w-10 h-10 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-white mb-4 font-display">تحديث دورة المحاكاة الأمنية</h3>
              <p className="text-zinc-400 mb-8 leading-relaxed text-sm">
                تم استعادة ضبط النظام الدوري (تطهير تجريبي لغرف العمليات بعد مرور 24 ساعة) لضمان حماية المعلومات وسرية المواقع التخطيطية. يمكنك الاستمرار في تشكيل وبناء غرف ومواقع جديدة الآن من الصفر.
              </p>
              <button
                onClick={() => setDataDeletedPopup(false)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all shadow-lg active:scale-95"
              >
                مفهوم، ابدأ التخطيط
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CreateGroupModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        user={user}
      />

      {/* Welcome Popup */}
      <AnimatePresence>
        {showWelcomePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowWelcomePopup(false);
                localStorage.setItem(`hasSeenWelcome_${user.uid}`, 'true');
              }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[36px] shadow-2xl p-8 sm:p-10 text-right text-white"
            >
              <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-400 border border-emerald-500/20">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-center text-white mb-4 font-display">المنصة العملياتية لإزالة الألغام (PMAC)</h3>
              <p className="text-zinc-400 mb-6 leading-relaxed text-sm">
                أهلاً بكم في منظومة المركز الميدانية. يتيح لكم التطبيق:
              </p>
              <ul className="space-y-3 mb-8 text-sm text-zinc-350">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                  <span>تأسيس وإدارة قطاعات ومواقع عمليات ميدانية للبحث والمسح الميداني.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                  <span>توثيق ورصد التهديدات والألغام والذخائر والمساحات المصابة لكل قطاع.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                  <span>مراجعة ذكية للتقارير الأمنية باستخدام تقنية الذكاء الاصطناعي (Gemini).</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                  <span>تسجيل الملاحظات الميدانية الفورية ومزامنتها في الوقت الفعلي مع الفريق.</span>
                </li>
              </ul>
              <button
                onClick={() => {
                  setShowWelcomePopup(false);
                  localStorage.setItem(`hasSeenWelcome_${user.uid}`, 'true');
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all shadow-lg text-base active:scale-95"
              >
                الدخول لغرفة العمليات المركزية
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
