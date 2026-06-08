import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  ArrowLeft,
  Plus,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  X,
  ShieldAlert,
  Target,
  Skull,
  Bell,
  MapPin,
  ClipboardList
} from 'lucide-react';
import { Group, Expense, BudgetType, CATEGORIES } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface DashboardProps {
  user: User;
  groups: Group[];
  onSelectGroup: (id: string) => void;
  theme: 'light' | 'dark';
}

interface Alert {
  id: string;
  message: string;
  type: 'danger' | 'warning' | 'info';
  groupId: string;
}

interface DashboardExpense extends Expense {
  groupId: string;
}

export default function Dashboard({ user, groups, onSelectGroup, theme }: DashboardProps) {
  const [recentExpenses, setRecentExpenses] = useState<DashboardExpense[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isGroupsListOpen, setIsGroupsListOpen] = useState(false);
  
  // Edit/Delete states
  const [editingExpense, setEditingExpense] = useState<DashboardExpense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<DashboardExpense | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const groupsListModalRef = React.useRef<HTMLDivElement>(null);
  const deleteExpenseModalRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGroupsListOpen && groupsListModalRef.current) {
      groupsListModalRef.current.focus();
    }
  }, [isGroupsListOpen]);

  useEffect(() => {
    if (expenseToDelete && deleteExpenseModalRef.current) {
      deleteExpenseModalRef.current.focus();
    }
  }, [expenseToDelete]);

  // Form states for editing
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState(CATEGORIES[0]);
  const [editDate, setEditDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (editingExpense) {
      setEditAmount(editingExpense.amount.toString());
      setEditDescription(editingExpense.description);
      setEditCategory(editingExpense.category);
      setEditDate(editingExpense.date.toDate().toISOString().split('T')[0]);
    }
  }, [editingExpense]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingExpense(null);
        setExpenseToDelete(null);
        setIsGroupsListOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    setIsSaving(true);
    try {
      const expenseRef = doc(db, 'groups', editingExpense.groupId, 'expenses', editingExpense.id);
      await updateDoc(expenseRef, {
        amount: parseFloat(editAmount),
        description: editDescription,
        category: editCategory,
        date: Timestamp.fromDate(new Date(editDate)),
      });
      setEditingExpense(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${editingExpense.groupId}/expenses/${editingExpense.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;

    setIsDeleting(true);
    try {
      const expenseRef = doc(db, 'groups', expenseToDelete.groupId, 'expenses', expenseToDelete.id);
      await deleteDoc(expenseRef);
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${expenseToDelete.groupId}/expenses/${expenseToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const isDateInCurrentPeriod = (date: Date, type: BudgetType) => {
    const now = new Date();
    if (type === 'total') return true;
    
    if (type === 'monthly') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    
    if (type === 'weekly') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      
      return date >= startOfWeek && date < endOfWeek;
    }
    
    return true;
  };

  useEffect(() => {
    if (groups.length === 0) {
      setRecentExpenses([]);
      setAlerts([]);
      return;
    }

    const expensesMap = new Map<string, DashboardExpense[]>();
    
    const unsubscribes = groups.map(group => {
      const expensesQuery = query(
        collection(db, 'groups', group.id, 'expenses'),
        orderBy('date', 'desc')
      );

      return onSnapshot(expensesQuery, (snapshot) => {
        const fetchedExpenses = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          groupId: group.id,
          ...doc.data() 
        } as DashboardExpense));
        
        expensesMap.set(group.id, fetchedExpenses);
        
        const allExpenses = Array.from(expensesMap.values()).flat();
        allExpenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        setRecentExpenses(allExpenses.slice(0, 10));
        
        // Generate high-quality security alerts
        const newAlerts: Alert[] = [];
        
        groups.forEach(g => {
          const gExpenses = expensesMap.get(g.id) || [];
          
          // 1. High count of anti-personnel/vehicle mines
          const criticalObjects = gExpenses.filter(e => 
            e.category.includes('لغم') || e.category.includes('عبوة')
          );
          if (criticalObjects.length >= 3) {
            newAlerts.push({
              id: `high-threat-${g.id}`,
              message: `مؤشر خطر مرتفع في "${g.name}": ثمة رصد مكثّف ومؤكد للألغام أو المتفجرات اليدوية الابتكارية بنشاط عالٍ.`,
              type: 'danger',
              groupId: g.id
            });
          }

          // 2. Budget/Area overload alert
          if (g.maxBudget) {
            const currentPeriodExpenses = gExpenses.filter(e => 
              isDateInCurrentPeriod(e.date.toDate(), g.budgetType || 'total')
            );
            const totalInfectedArea = currentPeriodExpenses.reduce((sum, e) => sum + e.amount, 0);
            
            if (totalInfectedArea > g.maxBudget) {
              newAlerts.push({
                id: `over-area-${g.id}`,
                message: `تنبيه تخطيطي لـ "${g.name}": إجمالي مساحة البلاغات النشطة تجاوز المقدر المقترح للقطاع عملياتياً (${totalInfectedArea.toLocaleString()} م² / ${g.maxBudget.toLocaleString()} م²).`,
                type: 'warning',
                groupId: g.id
              });
            }
          }
        });
        
        setAlerts(newAlerts);
        
      }, (error) => {
        if (error.message.includes('Missing or insufficient permissions')) {
          return;
        }
        console.error("Error fetching expenses for group", group.id, error);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [groups, user.uid]);

  return (
    <div className="max-w-6xl mx-auto" style={{ direction: 'rtl' }}>
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="text-right">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-2 font-display">
            مرحباً بك، ضابط العمليات <span className="text-emerald-600 dark:text-emerald-400 font-black">{user.displayName?.split(' ')[0]}</span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-base">إليك الموقف الأمني ونشاط رصد الألغام وتوزيع القطاعات اليوم.</p>
        </div>
        <button 
          onClick={() => (window as any).openCreateGroupModal?.()}
          className="flex items-center gap-2 px-6 py-3.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-505 hover:shadow-lg hover:shadow-emerald-900/10 dark:hover:shadow-emerald-500/10 transition-all shadow-md active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          تأسيس قطاع ميداني جديد
        </button>
      </header>

      {/* Grid Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <button 
          onClick={() => {
            if (groups.length === 0) return;
            if (groups.length === 1) {
              onSelectGroup(groups[0].id);
            } else {
              setIsGroupsListOpen(true);
            }
          }}
          className={`text-right p-6 rounded-[28px] border relative overflow-hidden group transition-all duration-300 ${groups.length > 0 ? 'hover:scale-[1.01] active:scale-95 cursor-pointer bg-zinc-900 border-zinc-800' : 'cursor-default bg-zinc-900/50 border-zinc-900'}`}
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10 flex flex-col items-start text-right">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-5 text-emerald-400">
              <MapPin className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">القطاعات المسجلة والنشطة</p>
            <p className="text-4xl font-black text-white font-display tracking-tight">{groups.length}</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (recentExpenses.length === 0) return;
            onSelectGroup(recentExpenses[0].groupId);
          }}
          className={`text-right p-6 rounded-[28px] border relative overflow-hidden group transition-all duration-300 ${recentExpenses.length > 0 ? 'hover:scale-[1.01] active:scale-95 cursor-pointer bg-[#0c2c1a] border-[#184f2f]/40' : 'cursor-default bg-zinc-900/50 border-zinc-900'}`}
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10 flex flex-col items-start text-right">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-5 text-emerald-300">
              <ClipboardList className="w-6 h-6 animate-pulse" />
            </div>
            <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest mb-1.5">إجمالي التقارير والمخاطر</p>
            <p className="text-4xl font-black text-white font-display tracking-tight">{recentExpenses.length}</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (alerts.length === 0) return;
            onSelectGroup(alerts[0].groupId);
          }}
          className={`text-right p-6 rounded-[28px] border relative overflow-hidden group transition-all duration-300 ${alerts.length > 0 ? 'hover:scale-[1.01] active:scale-95 cursor-pointer bg-[#330f14] border-[#d9534f]/10' : 'cursor-default bg-zinc-900/50 border-zinc-900'}`}
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10 flex flex-col items-start text-right">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-5 text-red-400">
              <ShieldAlert className="w-6 h-6 text-red-400 animate-bounce" />
            </div>
            <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest mb-1.5">إشعارات الخطورة القصوى</p>
            <p className="text-4xl font-black text-white font-display tracking-tight">{alerts.length}</p>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {isGroupsListOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
              onClick={() => setIsGroupsListOpen(false)}
            />
            <motion.div 
              ref={groupsListModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="select-group-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-850 rounded-[32px] text-white shadow-2xl overflow-hidden outline-none text-right"
              style={{ direction: 'rtl' }}
            >
              <div className="p-8">
                <h3 id="select-group-title" className="text-xl font-bold text-white mb-6 font-display">اختر القطاع الميداني للتصفح</h3>
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pl-1 custom-scrollbar">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => {
                        onSelectGroup(group.id);
                        setIsGroupsListOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 transition-all text-right group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${group.type === 'personal' ? 'bg-red-500' : group.type === 'trip' ? 'bg-amber-500' : group.type === 'household' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                        <span className="font-bold text-white">{group.name}</span>
                      </div>
                      <ArrowLeft className="w-4 h-4 text-zinc-500 group-hover:-translate-x-1 transition-transform shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Unified Operations Log */}
        <div className="lg:col-span-2 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">سجل التهديدات والنشاطات الميدانية الأخيرة</h2>
            </div>
            
            <div className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              {recentExpenses.length === 0 ? (
                <div className="p-16 text-center select-none">
                  <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-100 dark:border-transparent">
                    <ClipboardList className="w-8 h-8 text-zinc-400 dark:text-zinc-650" />
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-450 font-bold">لا يوجد أي بلاغات مسجلة في هذا النظام الميداني حالياً.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentExpenses.map(expense => (
                    <div key={expense.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between transition-all group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 gap-4">
                      
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 transition-all shrink-0">
                          {expense.category.includes('لغم') ? (
                            <Skull className="w-6 h-6 text-red-500" />
                          ) : expense.category.includes('مهمة') ? (
                            <Target className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <ShieldAlert className="w-6 h-6 text-amber-500" />
                          )}
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="font-bold text-zinc-955 dark:text-white text-base truncate">{expense.description}</p>
                          
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5">{expense.category}</span>
                            <span className="text-[9px] text-zinc-400 font-mono font-bold flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              {expense.date.toDate().toLocaleDateString('ar-PS', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-medium">
                              في قطاع <span className="font-bold text-zinc-900 dark:text-zinc-100 underline decoration-emerald-500/30">{groups.find(g => g.id === expense.groupId)?.name}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-zinc-100 dark:border-zinc-800/60 sm:border-0 pt-3 sm:pt-0 shrink-0">
                        <div className="text-right">
                          <p className={`text-base sm:text-lg font-black font-mono truncate ${expense.paidBy === user.uid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-200'}`}>
                            {expense.amount.toLocaleString()} م²
                          </p>
                          <p className="text-[9px] text-zinc-500 font-bold mt-0.5">
                            {expense.paidBy === user.uid ? 'تم التوثيق بواسطتك' : 'موثّق ميداني'}
                          </p>
                        </div>
                        {expense.paidBy === user.uid && (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingExpense(expense)}
                              className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xl transition-all"
                              title="تعديل البلاغ"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setExpenseToDelete(expense)}
                              className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all"
                              title="حذف البلاغ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Security / Over-capacity Warnings */}
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">إنذارات وتنسيقات الأمان</h2>
            </div>
            
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] text-center shadow-sm">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Target className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-emerald-600 dark:text-emerald-450 text-xs font-bold mb-1">جميع القطاعات آمنة وضمن الخطة المقررة</p>
                  <p className="text-zinc-400 text-[10px]">لا توجد مؤشرات تضخم أو بؤر حمراء غير مقروءة حالياً.</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <motion.div 
                    key={alert.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`p-5 rounded-[24px] border border-red-500/20 text-right shrink-0 ${
                      alert.type === 'danger' 
                        ? 'bg-red-500/5 text-red-200 border-red-500/20' 
                        : 'bg-amber-500/5 text-amber-200 border-amber-500/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        alert.type === 'danger' ? 'bg-red-500/10 text-red-400 animate-pulse' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        <ShieldAlert className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="flex-1 text-right">
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 flex items-center gap-1 mb-1">
                          {alert.type === 'danger' ? 'إشعار خطر قصوى' : 'إشعار عملياتي'}
                        </span>
                        <p className="text-xs font-semibold leading-relaxed text-zinc-100">{alert.message}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingExpense && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setEditingExpense(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-expense-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-8 md:p-10 outline-none text-right dir-rtl"
              style={{ direction: 'rtl' }}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="edit-expense-title" className="text-xl font-bold tracking-tight text-white font-display">تعديل التقرير الميداني</h3>
                <button 
                  onClick={() => setEditingExpense(null)} 
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5 text-zinc-500 hover:text-white" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateExpense} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-405 uppercase tracking-widest mb-2">المساحة المقدرة للموقع (م²)</label>
                  <div className="relative">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold pointer-events-none text-xs">م²</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full pr-10 pl-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono font-bold text-white text-right"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">تفاصيل البلاغ / أسلوب الاكتشاف</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-white text-right placeholder:text-zinc-700"
                    placeholder="مثال: رصد لغم مضاد للأفراد من نوع M14 بجوار الحقل الزراعي"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">التصنيف الفني للتأثير</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white text-right"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">تاريخ التوثيق</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white text-right"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4.5 bg-gradient-to-l from-emerald-600 to-green-600 text-white font-bold rounded-2xl transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-950/25 active:scale-95"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التحديثات الأمنية'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {expenseToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setExpenseToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteExpenseModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-expense-title"
              aria-describedby="delete-expense-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 text-center text-white outline-none"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-500/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 id="delete-expense-title" className="text-xl font-bold tracking-tight text-white mb-2 font-display">حذف التقرير نهائياً؟</h3>
              <p id="delete-expense-desc" className="text-zinc-400 mb-8 leading-relaxed text-xs">
                هل أنت متأكد من رغبتك في مسح هذا التقرير من قاعدة البيانات الفيدرالية للعمليات؟ لا يمكن التراجع عن هذا الإجراء لاحقاً.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 py-3.5 bg-zinc-800 text-zinc-300 rounded-2xl font-bold hover:bg-zinc-750 transition-all active:scale-95 text-sm"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleDeleteExpense}
                  disabled={isDeleting}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md active:scale-95 text-sm"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حذف وإزالة'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
