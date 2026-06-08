import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Compass, Skull, Target } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { GroupType, BudgetType } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export default function CreateGroupModal({ isOpen, onClose, user }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<GroupType>('personal');
  const [maxBudget, setMaxBudget] = useState('');
  const [budgetType, setBudgetType] = useState<BudgetType>('total');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. Create the group (now sector)
      const groupData: any = {
        name: name.trim(),
        description: description.trim(),
        type,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        memberIds: [user.uid],
      };

      if (maxBudget && !isNaN(parseFloat(maxBudget))) {
        groupData.maxBudget = parseFloat(maxBudget);
        groupData.budgetType = budgetType;
      }

      const groupRef = await addDoc(collection(db, 'groups'), groupData);
      console.log(`Operational Sector created successfully with ID: ${groupRef.id}`);

      // 2. Add the creator as an admin member (now command officer)
      await setDoc(doc(db, 'groups', groupRef.id, 'members', user.uid), {
        uid: user.uid,
        role: 'admin',
        joinedAt: serverTimestamp(),
        displayName: user.displayName,
        email: user.email,
      });

      onClose();
      setName('');
      setDescription('');
      setType('personal');
      setMaxBudget('');
      setBudgetType('total');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'groups');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[32px] text-white shadow-2xl overflow-y-auto max-h-[90vh] outline-none dir-rtl"
            style={{ direction: 'rtl' }}
          >
            <div className="p-8 sm:p-10">
              <div className="flex items-center justify-between mb-8">
                <h2 id="modal-title" className="text-2xl font-bold tracking-tight text-white font-display">تأسيس قطاع عمليات ميداني جديد</h2>
                <button 
                  onClick={onClose} 
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="إغلاق النافذة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="group-name" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 font-display text-right">اسم القطاع أو المنطقة المستهدفة</label>
                  <input
                    id="group-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: قطاع جنين وشمال الضفة، قطاع غزة الشرقي"
                    className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-medium text-white placeholder:text-zinc-600 text-right"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="group-desc" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 font-display text-right">وصف القطاع وخطة العمل (اختياري)</label>
                  <textarea
                    id="group-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="اكتب تفاصيل عن طبيعة المخاطر الأثرية، التضاريس، أو أهداف البعثة الحالية لتنظيف المنطقة..."
                    className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all resize-none h-24 font-medium text-white placeholder:text-zinc-600 text-right"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 font-display text-right">تصنيف وهيكل القطاع</label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'personal', label: 'حقل ألغام مؤكد', icon: Skull, activeClass: 'bg-red-500/10 border-red-500 text-red-200 shadow-lg shadow-red-500/10', iconActive: 'text-red-400' },
                      { id: 'trip', label: 'موقع بلاغات مباشر', icon: ShieldAlert, activeClass: 'bg-amber-500/10 border-amber-500 text-amber-200 shadow-lg shadow-amber-500/10', iconActive: 'text-amber-400' },
                      { id: 'household', label: 'منطقة عمليات وتطهير', icon: Target, activeClass: 'bg-emerald-500/10 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/10', iconActive: 'text-emerald-400' },
                      { id: 'other', label: 'تثقيف وتوعية جماهيرية', icon: Compass, activeClass: 'bg-blue-500/10 border-blue-500 text-blue-200 shadow-lg shadow-blue-500/10', iconActive: 'text-blue-400' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setType(item.id as GroupType)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-300 outline-none focus:ring-2 focus:ring-emerald-500 text-right ${
                          type === item.id
                            ? item.activeClass
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <item.icon className={`w-5 h-5 shrink-0 ${type === item.id ? item.iconActive : 'text-zinc-600'}`} />
                        <span className="font-bold text-sm truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-800">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4 font-display text-right">المساحة الجغرافية المستهدفة وخطة التطهير</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="max-budget" className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider font-display text-right">المساحة المستهدفة (م²)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 font-bold text-xs pointer-events-none">م²</span>
                        <input
                          id="max-budget"
                          type="number"
                          step="0.01"
                          value={maxBudget}
                          onChange={(e) => setMaxBudget(e.target.value)}
                          placeholder="مثال: 5000"
                          className="w-full pr-10 pl-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono font-bold text-white placeholder:text-zinc-700 text-right"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="budget-freq" className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider font-display text-right">مرحلة الفرز الميداني</label>
                      <select
                        id="budget-freq"
                        value={budgetType}
                        onChange={(e) => setBudgetType(e.target.value as BudgetType)}
                        className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-bold text-white text-right"
                      >
                        <option value="weekly">مرحلة تطهير أسبوعية</option>
                        <option value="monthly">مرحلة تطهير شهرية</option>
                        <option value="total">تطهير شامل لكامل المراحل</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4.5 bg-gradient-to-l from-emerald-600 to-green-600 text-white rounded-2xl font-bold hover:from-emerald-500 hover:to-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-xl shadow-emerald-950/20 active:scale-[0.98] outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                >
                  {isSubmitting ? 'جاري تأسيس وتسجيل القطاع العملياتي...' : 'تأسيس القطاع الميداني وتوثيقه'}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
