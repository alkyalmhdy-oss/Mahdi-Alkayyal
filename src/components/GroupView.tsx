import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  MoreVertical, 
  Trash2, 
  UserPlus,
  TrendingUp,
  PieChart as PieChartIcon,
  Calendar,
  Sparkles,
  Loader2,
  Pencil,
  X,
  Send,
  CheckCircle,
  AlertTriangle,
  FileText,
  Skull,
  Shield,
  Clock,
  Target,
  Download,
  Printer
} from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc,
  addDoc, 
  deleteDoc, 
  Timestamp,
  updateDoc,
  arrayUnion,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Group, Expense, GroupMember, CATEGORIES, BudgetType, FieldNote } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface GroupViewProps {
  groupId: string;
  user: User;
  onBack: () => void;
  theme: 'light' | 'dark';
}

const defaultChecklist = [
  { id: 'step-1', text: 'تطويق الموقع المكتشف بالشريط التحذيري الفسفوري العازل لمنع دخول المدنيين.', checked: false },
  { id: 'step-2', text: 'تأمين نقاط الإخلاء الطبي وممر آمن لسيارات الإسعاف بالتعاون مع الدفاع المدني.', checked: false },
  { id: 'step-3', text: 'توزيع شواخص حمراء هرمية واضحة تحمل تحذير (احذر! ألغام).', checked: false },
  { id: 'step-4', text: 'تفتيش يدوي أولي بأجهزة تصنيف المعادن لرصد الحدود الخارجية للحقل.', checked: false },
  { id: 'step-5', text: 'توثيق الإحداثيات الجغرافية الكاملة ورفعها لغرفة التحكم لإدراجها في الخريطة الوطنية للمخاطر.', checked: false },
  { id: 'step-6', text: 'إعداد خطة التفجير المسيطر عليه للمقذوفات غير المستقرة أو النقل الآمن للذخائر المعدة للمستوع الخاص.', checked: false },
  { id: 'step-7', text: 'عقد جلسة توعية وتنبيه سريعة لسكان التجمع الزراعي أو السكني المحيط.', checked: false }
];

export default function GroupView({ groupId, user, onBack, theme }: GroupViewProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  
  // Settings states
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMaxBudget, setEditMaxBudget] = useState('');
  const [editBudgetType, setEditBudgetType] = useState<BudgetType>('monthly');

  // Interactive Live Note state
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // AI Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const analysisAbortController = useRef<AbortController | null>(null);

  // Stat details modal state
  const [selectedStatDetails, setSelectedStatDetails] = useState<{ title: string; amount: number; subtitle?: string } | null>(null);

  const statModalRef = useRef<HTMLDivElement>(null);
  const analysisModalRef = useRef<HTMLDivElement>(null);
  const deleteGroupModalRef = useRef<HTMLDivElement>(null);
  const deleteExpenseModalRef = useRef<HTMLDivElement>(null);

  const closeAnalysisModal = () => {
    setIsAnalysisModalOpen(false);
    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
      analysisAbortController.current = null;
    }
    setIsAnalyzing(false);
    setAnalysisResult(null);
  };

  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [isDeleteGroupConfirmOpen, setIsDeleteGroupConfirmOpen] = useState(false);

  useEffect(() => {
    if (selectedStatDetails && statModalRef.current) {
      statModalRef.current.focus();
    }
  }, [selectedStatDetails]);

  useEffect(() => {
    if (isAnalysisModalOpen && analysisModalRef.current) {
      analysisModalRef.current.focus();
    }
  }, [isAnalysisModalOpen]);

  useEffect(() => {
    if (isDeleteGroupConfirmOpen && deleteGroupModalRef.current) {
      deleteGroupModalRef.current.focus();
    }
  }, [isDeleteGroupConfirmOpen]);

  useEffect(() => {
    if (expenseToDelete && deleteExpenseModalRef.current) {
      deleteExpenseModalRef.current.focus();
    }
  }, [expenseToDelete]);

  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    const groupRef = doc(db, 'groups', groupId);
    const unsubscribeGroup = onSnapshot(groupRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Group;
        setGroup({ id: doc.id, ...data } as Group);
        setEditName(data.name);
        setEditDescription(data.description || '');
        setEditMaxBudget(data.maxBudget?.toString() || '');
        setEditBudgetType(data.budgetType || 'monthly');
      }
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching group:", error);
    });

    const expensesQuery = query(collection(db, 'groups', groupId, 'expenses'), orderBy('date', 'desc'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching expenses:", error);
    });

    const membersQuery = collection(db, 'groups', groupId, 'members');
    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as unknown as GroupMember)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching members:", error);
    });

    return () => {
      unsubscribeGroup();
      unsubscribeExpenses();
      unsubscribeMembers();
    };
  }, [groupId]);

  useEffect(() => {
    if (editingExpense) {
      setAmount(editingExpense.amount.toString());
      setDescription(editingExpense.description);
      setCategory(editingExpense.category);
      setDate(editingExpense.date.toDate().toISOString().split('T')[0]);
      setIsAddExpenseOpen(true);
    }
  }, [editingExpense]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const expenseData = {
      amount: parseFloat(amount),
      description: description.trim(),
      category,
      date: Timestamp.fromDate(new Date(date)),
      paidBy: user.uid,
    };

    try {
      if (editingExpense) {
        const expenseRef = doc(db, 'groups', groupId, 'expenses', editingExpense.id);
        await updateDoc(expenseRef, expenseData);
      } else {
        const expensesRef = collection(db, 'groups', groupId, 'expenses');
        await addDoc(expensesRef, {
          ...expenseData,
          createdAt: serverTimestamp(),
        });
      }
      setIsAddExpenseOpen(false);
      setEditingExpense(null);
      setAmount('');
      setDescription('');
    } catch (error) {
      handleFirestoreError(error, editingExpense ? OperationType.UPDATE : OperationType.CREATE, `groups/${groupId}/expenses`);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await deleteDoc(doc(db, 'groups', groupId, 'expenses', expenseId));
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/expenses/${expenseId}`);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail) return;

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const usersQuery = query(collection(db, 'users'), where('email', '==', newMemberEmail.trim().toLowerCase()));
      const userSnapshot = await getDocs(usersQuery);

      if (userSnapshot.empty) {
        setInviteError('المستخدم غير موجود بالنظام الموحد، تفقد البريد الإلكتروني المدخل.');
        setInviteLoading(false);
        return;
      }

      const invitedUser = userSnapshot.docs[0].data();
      const invitedUid = userSnapshot.docs[0].id;

      const memberDocRef = doc(db, 'groups', groupId, 'members', invitedUid);
      await setDoc(memberDocRef, {
        uid: invitedUid,
        displayName: invitedUser.displayName || 'ضابط ميداني جديد',
        email: invitedUser.email,
        role: 'مستطلع ميداني',
        joinedAt: serverTimestamp(),
      });

      // Update group member ids array
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        memberIds: arrayUnion(invitedUid)
      });

      setInviteSuccess(true);
      setNewMemberEmail('');
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (error) {
      console.error("Invite Error:", error);
      setInviteError('عذراً، حدث خطأ أثناء إرسال الدعوة الأمنية.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;

    try {
      await updateDoc(doc(db, 'groups', groupId), {
        name: editName.trim(),
        description: editDescription.trim(),
        maxBudget: editMaxBudget ? parseFloat(editMaxBudget) : null,
        budgetType: editBudgetType,
      });
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
    }
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    }
  };

  const handleAddLiveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !group) return;

    setIsSubmittingNote(true);
    try {
      const groupRef = doc(db, 'groups', groupId);
      const newNote: FieldNote = {
        id: Math.random().toString(36).substring(2, 9),
        author: user.displayName || 'ضابط ميداني',
        role: members.find(m => m.uid === user.uid)?.role || 'هندسة متفجرات',
        content: noteText.trim(),
        timestamp: Timestamp.fromDate(new Date()),
      };

      await updateDoc(groupRef, {
        notes: arrayUnion(newNote)
      });

      setNoteText('');
    } catch (error) {
      console.error("Error adding live note:", error);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleToggleChecklist = async (itemId: string, currentChecked: boolean) => {
    if (!group) return;
    
    const checklistPool = group.checklist || defaultChecklist;
    const updatedChecklist = checklistPool.map(item => 
      item.id === itemId ? { ...item, checked: !currentChecked } : item
    );

    try {
      await updateDoc(doc(db, 'groups', groupId), {
        checklist: updatedChecklist
      });
    } catch (error) {
      console.error("Error setting checklist item state:", error);
    }
  };

  const downloadTextReport = () => {
    if (!group) return;

    const totalArea = expenses.reduce((sum, e) => sum + e.amount, 0);
    const checklistItems = group.checklist || defaultChecklist;
    const completedChecklist = checklistItems.filter(item => item.checked).length;
    const checklistPercent = Math.round((completedChecklist / checklistItems.length) * 100);

    let report = `================================================================================
                    المركز الفلسطيني لإزالة الألغام (PMAC)
                 تقرير عملياتي ميداني مفصل وعاجل للقطاع الميداني
================================================================================

[1. معلومات القطاع الرئيسية]
--------------------------------------------------------------------------------
- اسم القطاع الميداني: ${group.name}
- نمط وتصنيف القطاع: ${
      group.type === 'personal' ? 'قطاع عالي الخطورة' :
      group.type === 'trip' ? 'حقل مسح طارئ' :
      group.type === 'household' ? 'منطقة زراعية مأهولة' : 'موقع إنشائي'
    }
- الوصف والمسؤوليات الميدانية:
  ${group.description || 'لا يوجد وصف مضاف حالياً لهذا القطاع.'}
- تاريخ التصدير: ${new Date().toLocaleDateString('ar-PS')} ${new Date().toLocaleTimeString('ar-PS')}
- مصل الفتح: مستمر منذ تأسيس المعاينة الفنية.
- إجمالي المساحة المصابة الموثقة: ${totalArea.toLocaleString()} م²
- الحد الجغرافي للقطاع: ${group.maxBudget ? `${group.maxBudget.toLocaleString()} م²` : 'غير محدد'}
- كفاءة الالتزام ببروتوكول السلامة الحار (IMAS): ${checklistPercent}% (${completedChecklist} من أصل ${checklistItems.length} خطوات منجزة)

[2. بروتوكول تصفية وتأمين المواقع (IMAS) - قائمة التحقق ونسب التنفيذ]
--------------------------------------------------------------------------------
${checklistItems.map((item, idx) => `[${item.checked ? 'مكتمل' : 'معلق'}] الخطوة ${idx + 1}: ${item.text}`).join('\n')}

[3. سجل الملاحظات والتعليمات العملياتية الفورية المكتوبة]
--------------------------------------------------------------------------------
${!group.notes || group.notes.length === 0 
  ? '- لم تسجّل ملاحظات عملياتية فورية مكتوبة بعد.' 
  : group.notes.map((note, idx) => `[${idx + 1}] الضابط: ${note.author} (${note.role})
    الملحوظة: ${note.content}
    التوقيت: ${
      note.timestamp instanceof Timestamp 
        ? note.timestamp.toDate().toLocaleString('ar-PS')
        : new Date(note.timestamp as any).toLocaleString('ar-PS')
    }`).join('\n\n')}

[4. سجل البلاغات والذخائر والجهود الميدانية المسجّلة للقطاع]
--------------------------------------------------------------------------------
إجمالي البلاغات المدرجة: ${expenses.length}

${expenses.length === 0 
  ? '- لا يوجد أي بلاغات رصد ذخائر وألغام مسجلة لهذا القطاع حالياً.' 
  : expenses.map((expense, idx) => `[${idx + 1}] تفصيل التهديد: ${expense.description}
    التصنيف الفني: ${expense.category}
    المساحة المصابة المقدرة: ${expense.amount.toLocaleString()} م²
    تاريخ الكشف: ${expense.date.toDate().toLocaleDateString('ar-PS')}
    الضابط الذي وثق البلاغ: ${members.find(m => m.uid === expense.paidBy)?.displayName || 'مستكشف PMAC'}`).join('\n\n')}

================================================================================
                               تم إصدار وتوليد هذا الملف آلياً من نظام PMAC
================================================================================`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PMAC_Report_${group.name.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    setIsExportModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // AI Security Assessment Report Prompt
  const handleAnalyzeThreats = async () => {
    setIsAnalyzing(true);
    setIsAnalysisModalOpen(true);
    setAnalysisResult(null);

    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
    }
    const abortController = new AbortController();
    analysisAbortController.current = abortController;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const threatSummary = expenses.map(e => ({
        size: e.amount,
        description: e.description,
        classification: e.category,
        date: e.date.toDate().toLocaleDateString('ar-PS')
      }));

      const prompt = `
        بصفتك كبير المستشارين الأمنيين والتقنيين في المركز الفلسطيني لإزالة الألغام (PMAC)، قم بتحليل البيانات الميدانية الحالية للقطاع العملياتي النشط تحت مسمى: "${group?.name}".
        وصف القطاع الجغرافي: ${group?.description || 'لا يوجد وصف مضاف'}
        إجمالي المساحة المصابة المرصودة بالقطاع: ${expenses.reduce((sum, e) => sum + e.amount, 0)} متر مربع (م²).
        المستهدف الأقصى المقدر للمسح: ${group?.maxBudget || 'مفتوح / غير محدد'} م².

        سجل التهديدات والذخائر المتفجرة المرصودة بالقطاع:
        ${JSON.stringify(threatSummary, null, 2)}

        المطلوب صياغة تقرير تقييم مخاطر ميداني احترافي للغاية ومطابق للمعايير الدولية للعمل الإنساني لإزالة الألغام (IMAS). اكتب التقرير بالكامل باللغة العربية بأسلوب فني عسكري رسمي ومطمئن في ذات الوقت، وقسمه إلى الأقسام التالية:
        1. **الملخص التنفيذي ومستوى خطورة القطاع**: حدد بدقة تصنيف الخطورة (منخفض / متوسط / حرج للغاية).
        2. **تحليل توزيع التهديدات**: ما هي التهديدات الأشد تكراراً (مثل ألغام مضادة للأفراد، مخلفات قصف جوي، عبوات ابتكارية) وتأثيرها على الطبيعة الجغرافية والسكانية.
        3. **البروتوكول الأمني وتوجيهات السلامة الفورية للبعثة**: خطوات تأمينية عاجلة لضمان عدم حدوث خسائر بين طواقم الاستكشاف أو سكان الجوار الزراعيين.
        4. **خطة التدخل التطهيري الموصى بها**: أولويات العمليات الميدانية القادمة (أين يجب التركيز أولاً وبأي تصنيف).

        اجعل التقرير ذا مظهر صلب ومقنع، مستعملاً مصطلحات احترافية مثل "المسح الفني غير الفني"، "تطهير البؤر الساخنة"، "إبطال مفعول"، "توعية بمخاطر الألغام (MRE)".
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }]
      });

      if (abortController.signal.aborted) return;

      setAnalysisResult(response.text || "فشل توليد التقرير الأمني الميداني؛ تفقد السجل لاحقاً.");
    } catch (error: any) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      console.error("AI Analysis Error:", error);
      setAnalysisResult("عذراً، حدث خطأ أثناء تشغيل محرك تحليلات الذكاء الاصطناعي التابع للمركز. الرجاء إعادة المحاولة لاحقاً.");
    } finally {
      if (!abortController.signal.aborted) {
        setIsAnalyzing(false);
      }
    }
  };

  if (!group) return null;

  // Calculators suited to PMAC Operations
  const totalAreaInfected = expenses.reduce((sum, e) => sum + e.amount, 0);
  const myLoggedCount = expenses.filter(e => e.paidBy === user.uid).length;
  const myTotalLoggedArea = expenses.filter(e => e.paidBy === user.uid).reduce((sum, e) => sum + e.amount, 0);
  const myLoggedSharePercent = totalAreaInfected > 0 ? ((myTotalLoggedArea / totalAreaInfected) * 100).toFixed(0) : '0';

  // Spending timeline maps to Ranging of threat logs
  const lineData = expenses
    .slice()
    .reverse()
    .map(e => ({
      name: e.date.toDate().toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' }),
      amount: e.amount
    }));

  // Recharts colors
  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#71717a'];

  // Categorize breakdown for charts
  const categorySummary: { [key: string]: number } = {};
  expenses.forEach(e => {
    categorySummary[e.category] = (categorySummary[e.category] || 0) + e.amount;
  });
  const pieData = Object.keys(categorySummary).map(cat => ({
    name: cat,
    value: categorySummary[cat]
  }));

  return (
    <div className="max-w-6xl mx-auto" style={{ direction: 'rtl' }}>
      <div className="print:hidden">
        
        {/* Back button */}
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white dark:hover:border-zinc-700 rounded-xl transition-all duration-200 mb-8 group shadow-sm text-sm font-semibold pointer-events-auto"
        >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        <span>العودة للوحة العمليات</span>
      </button>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-10 text-right">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
              group.type === 'personal' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
              group.type === 'trip' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
              group.type === 'household' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
              'bg-blue-500/10 text-blue-400 border border-blue-500/10'
            }`}>
              النوع: {group.type === 'personal' ? 'قطاع عالي الخطورة' : group.type === 'trip' ? 'حقل مسح طارئ' : group.type === 'household' ? 'منطقة زراعية مأهولة' : 'موقع إنشائي'}
            </span>
            <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px] font-bold">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>مستمر منذ التأسيس</span>
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">{group.name}</h1>
          <p className="text-zinc-650 dark:text-zinc-350 max-w-2xl leading-relaxed font-semibold text-sm">{group.description || 'لم يتم إدراج وصف عملياتي تفصيلي لهذا القطاع الميداني.'}</p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-stretch lg:justify-end gap-3 w-full md:w-auto self-start">
          {user.uid === group.createdBy && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-white transition-all shadow-sm flex items-center justify-center shrink-0"
              title="إعدادات القطاع الميداني"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          )}

          <button 
            onClick={() => setIsAddMemberOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3.5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-all active:scale-95 shadow-sm"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            إضافة مستكشف
          </button>

          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3.5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-extrabold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-all active:scale-95 shadow-sm"
            title="تصدير تقرير عملياتي مفصل بصيغة PDF أو TXT"
          >
            <Download className="w-4 h-4 shrink-0" />
            تصدير تقرير فني
          </button>

          <button 
            onClick={handleAnalyzeThreats}
            disabled={isAnalyzing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-l from-emerald-600 to-teal-600 text-white rounded-2xl text-sm font-black transition-all disabled:opacity-50 shadow-md active:scale-95 hover:from-emerald-700 hover:to-teal-700 shrink-0"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0 animate-pulse" />}
            استشارة الذكاء الاصطناعي
          </button>

          <button 
            onClick={() => {
              setEditingExpense(null);
              setIsAddExpenseOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-zinc-900 dark:bg-zinc-950 text-white rounded-2xl text-sm font-bold hover:bg-zinc-850 dark:hover:bg-zinc-800 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            إدراج بلاغ رصد جديد
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10 text-right">
        
        {/* Metric 1 */}
        <button 
          onClick={() => setSelectedStatDetails({ title: 'المساحة المصابة الموثقة كلياً (م²)', amount: totalAreaInfected })}
          className="text-right w-full bg-white dark:bg-zinc-900 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-850 shadow-sm relative overflow-hidden group hover:scale-[1.01] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -ml-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">إجمالي المساحة المصابة المرصودة</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white font-display tracking-tight truncate">
              {totalAreaInfected.toLocaleString()} م²
            </p>
            {group.maxBudget && (
              <div className="mt-5 text-right">
                <div className="flex justify-between items-center text-[10px] font-bold mb-1.5">
                  <span className="text-zinc-500">الحد المستهدف للقطاع</span>
                  <span className={totalAreaInfected > group.maxBudget ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                    {((totalAreaInfected / group.maxBudget) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-750 ease-out ${totalAreaInfected > group.maxBudget ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (totalAreaInfected / group.maxBudget) * 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-zinc-500 mt-1.5 font-medium">
                  الموثَّق {totalAreaInfected.toLocaleString()} م² من أصل {group.maxBudget.toLocaleString()} م² مستهدفة.
                </p>
              </div>
            )}
          </div>
        </button>

        {/* Metric 2 */}
        <button 
          onClick={() => setSelectedStatDetails({ title: 'البلاغات والمسوحات المسجلة بجهدك', amount: myTotalLoggedArea, subtitle: `لقد وثّقت ${myLoggedCount} بلاغات تمثل ${myLoggedSharePercent}% من إجمالي المساحة المتضررة بالقطاع.` })}
          className="text-right w-full bg-white dark:bg-zinc-900 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-850 shadow-sm relative overflow-hidden group hover:scale-[1.01] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -ml-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">جهدك التوثيقي بالمنطقة</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white font-display tracking-tight truncate">
              {myTotalLoggedArea.toLocaleString()} م²
            </p>
            <p className="text-[10px] font-medium text-emerald-500 mt-3 flex items-center gap-1.5 justify-start">
              <CheckCircle className="w-3.5 h-3.5" />
              مساهمتك تشكل {myLoggedSharePercent}% من الحقل الكلي.
            </p>
          </div>
        </button>

        {/* Metric 3 */}
        <div className="text-right w-full bg-zinc-950 p-6 rounded-[24px] border border-zinc-850 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mt-16" />
          <div className="relative">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">كفاءة الاستجابة للبروتوكول الميداني</p>
            <p className="text-3xl font-black text-emerald-400 font-display tracking-tight">
              {(() => {
                const checkedCount = (group.checklist || defaultChecklist).filter(item => item.checked).length;
                const percent = Math.round((checkedCount / (group.checklist || defaultChecklist).length) * 100);
                return `${percent}%`;
              })()}
            </p>
            <p className="text-[10px] font-medium text-zinc-400 mt-3">
              {(group.checklist || defaultChecklist).filter(item => item.checked).length} من أصل {defaultChecklist.length} خطوات بروتوكول سلامة مستوفاة بالقطاع.
            </p>
          </div>
        </div>

      </div>

      {/* Checklist & Field Notes Row (Real-time features!) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 text-right">
        
        {/* Demining Safety Protocol (قائمة المهام والبروتوكول) */}
        <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-850 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500 shrink-0" />
              قائمة بروتوكول تصفية وتأمين المواقع (IMAS)
            </h3>
            <p className="text-zinc-500 text-[11px] mb-6">تعليمات أمنية ملزمة للفريق الاستكشافي بالقطاع تتم مزامنتها لحظياً لتتبع الجاهزية.</p>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pl-1 custom-scrollbar">
              {(group.checklist || defaultChecklist).map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => handleToggleChecklist(item.id, item.checked)}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-all cursor-pointer text-right group"
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    item.checked 
                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                      : 'border-zinc-300 dark:border-zinc-800'
                  }`}>
                    {item.checked && <CheckCircle className="w-4.5 h-4.5" />}
                  </div>
                  <p className={`text-xs select-none leading-relaxed transition-all ${
                    item.checked ? 'line-through text-zinc-450 dark:text-zinc-550' : 'text-zinc-700 dark:text-zinc-200 font-semibold'
                  }`}>
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Real-time Field Notes Section (الملاحظات والمزامنة) */}
        <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-850 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
              المذكرة والتعليمات العملياتية الحية
            </h3>
            <p className="text-zinc-500 text-[11px] mb-5">توجيهات فنية وتحديثات حية متبادلة مع المقر الفيدرالي والضباط في الحقل.</p>

            <div className="space-y-3.5 max-h-[280px] overflow-y-auto pl-1 custom-scrollbar mb-4">
              {!group.notes || group.notes.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 select-none">
                  <p className="text-xs italic">لا توجد ملاحظات أو تعليمات ميدانية تم تدوينها لهذا القطاع بعد.</p>
                </div>
              ) : (
                group.notes.map((note) => (
                  <div key={note.id} className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 text-right">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{note.author}</span>
                        <span className="text-[9px] text-zinc-400 font-semibold mr-1.5 px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-md">{note.role}</span>
                      </div>
                      <span className="text-[9px] text-zinc-400 font-semibold font-mono">
                        {note.timestamp instanceof Timestamp 
                          ? note.timestamp.toDate().toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit' })
                          : new Date(note.timestamp as any).toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit' })
                        }
                      </span>
                    </div>
                    <p className="text-xs text-zinc-650 dark:text-zinc-300 font-medium leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleAddLiveNote} className="flex gap-2">
            <input 
              type="text" 
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs dark:text-white placeholder:text-zinc-500 font-medium text-right"
              placeholder="اكتب أمراً أو ملحوظة ميدانية جديدة هنا..."
              maxLength={400}
              required
            />
            <button 
              type="submit" 
              disabled={isSubmittingNote || !noteText.trim()}
              className="px-4.5 py-3 bg-emerald-600 hover:bg-emerald-505 text-white rounded-xl transition-all disabled:opacity-40 flex items-center justify-center shrink-0 active:scale-95"
            >
              {isSubmittingNote ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
            </button>
          </form>
        </div>

      </div>

      {/* Diagrams Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        
        {/* Trend chart */}
        <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-850 shadow-sm text-right">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            وتيرة تطور الرصد الزمني للمساحات (م²)
          </h3>
          <div className="h-[260px] w-full">
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={lineData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" opacity={0.3} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#71717a', fontWeight: 'bold' }}
                    interval="preserveStart"
                    minTickGap={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#71717a', fontWeight: 'bold' }}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid #27272a', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', 
                      padding: '12px', 
                      backgroundColor: '#09090b', 
                      color: '#ffffff',
                      textAlign: 'right'
                    }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#ffffff' }}
                    labelStyle={{ fontSize: '9px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value.toLocaleString()} م²`, 'مساحة البلاغ']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#10b981" 
                    strokeWidth={4} 
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-550 text-xs text-center">
                <p className="italic">لا توجد بيانات تاريخية لإظهار منحنى وتيرة الرصد حالياً.</p>
              </div>
            )}
          </div>
        </div>

        {/* Pie chart representing classification distribution */}
        <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-850 shadow-sm text-right">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-emerald-500" />
            النسب المئوية لأنواع الذخائر المقيدة للخطوط
          </h3>
          <div className="h-[260px] w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={6}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`${value.toLocaleString()} م²`, 'المساحة المصابة']}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid #27272a', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', 
                      padding: '12px', 
                      backgroundColor: '#09090b', 
                      color: '#ffffff',
                      textAlign: 'right'
                    }}
                    itemStyle={{ color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', paddingTop: '15px', color: '#a1a1aa' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-550 text-xs text-center">
                <PieChartIcon className="w-10 h-10 mb-2 opacity-20 text-emerald-500" />
                <p className="italic">لم يتم إدخال بلاغات بعد للتصنيف والتحليل الهيكلي.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Row list of logs and members */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Reports log list */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5 font-display">
              <Clock className="w-5 h-5 text-emerald-500" />
              قائمة السجلات والمسوحات المصنفّة بالقطاع
            </h2>
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{expenses.length} بلاغات مسجلة</div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200 dark:border-zinc-850 overflow-hidden shadow-sm">
            {expenses.length === 0 ? (
              <div className="p-12 text-center select-none">
                <p className="text-zinc-500 font-bold text-sm">البلاغ نظيف وخالٍ من الذخائر المقفلة.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-850">
                {expenses.map(expense => (
                  <div key={expense.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between group transition-all duration-250 gap-4 hover:bg-zinc-500/5">
                    
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-950 rounded-2xl flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 border border-zinc-150 dark:border-zinc-850 shrink-0">
                        <span className="text-[9px] font-bold uppercase text-zinc-550 font-mono">
                          {expense.date.toDate().toLocaleDateString('ar-PS', { month: 'short' })}
                        </span>
                        <span className="text-base font-black leading-none text-zinc-900 dark:text-white">{expense.date.toDate().getDate()}</span>
                      </div>
                      
                      <div className="min-w-0 text-right">
                        <p className="font-extrabold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors text-sm sm:text-base leading-snug truncate">
                          {expense.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg text-[9px] font-bold text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">{expense.category}</span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            رصده الضابط: <span className="font-bold text-zinc-900 dark:text-zinc-300 underline underline-offset-2">{members.find(m => m.uid === expense.paidBy)?.displayName || 'مستكشف PMAC'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0 mt-4 sm:mt-0">
                      <div className="text-right">
                        <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white font-mono leading-none">
                          {expense.amount.toLocaleString()} م²
                        </p>
                        <p className="text-[9px] font-bold text-zinc-500 mb-1">المساحة المقدرة</p>
                      </div>

                      {expense.paidBy === user.uid && (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setEditingExpense(expense)}
                            className="p-2 text-zinc-400 hover:text-emerald-505 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all"
                            title="تعديل هذا التوثيق للمخاطر"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setExpenseToDelete(expense.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all"
                            title="حذف السجل نهائياً"
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
        </div>

        {/* Group members list */}
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white mb-6 flex items-center gap-2 font-display">
            <Users className="w-5 h-5 text-emerald-505" />
            كتيبة الاستكشاف بالقطاع
          </h2>
          
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-850 shadow-sm">
            <div className="space-y-4">
              {members.map(member => (
                <div key={member.uid} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 bg-zinc-50 dark:bg-zinc-950 rounded-xl flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:border-emerald-500 font-black border border-zinc-150 dark:border-zinc-850 transition-colors">
                        {member.displayName?.charAt(0)}
                      </div>
                      {member.uid === group.createdBy && (
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-600 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center">
                          <Sparkles className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{member.displayName}</p>
                      <p className="text-[9px] font-black text-zinc-405 uppercase tracking-wider">{member.role === 'admin' ? 'مشرف فني للقطاع' : 'ضابط استكشاف'}</p>
                    </div>
                  </div>
                  {member.uid === group.createdBy && (
                    <span className="shrink-0 text-[8px] font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">منشئ السجل</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Add Report Modal */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddExpenseOpen(false);
                setEditingExpense(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-expense-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-6 sm:p-10 outline-none text-right"
              style={{ direction: 'rtl' }}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="add-expense-title" className="text-xl font-bold tracking-tight text-white font-display">
                  {editingExpense ? 'تعديل تقرير الرصد الميداني' : 'إضافة بلاغ رصد ذخائر وألغام'}
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddExpenseOpen(false);
                    setEditingExpense(null);
                  }} 
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5 text-zinc-500 hover:text-white" />
                </button>
              </div>
              
              <form onSubmit={handleAddExpense} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-450 uppercase tracking-widest mb-2">المساحة المصابة التقديرية (م²)</label>
                  <div className="relative">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-xs pointer-events-none">م²</span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pr-10 pl-4 py-4 bg-zinc-950 border border-zinc-805 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono font-bold text-lg text-white text-right"
                      placeholder="0.00"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">نوع المخلفات / وتفصيل التهديد</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-semibold text-white text-right placeholder:text-zinc-700 text-sm"
                    placeholder="مثال: رصد ذخيرة غير منفجرة من عيار 155 مم"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">تصنيف المادة المتفجرة</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white text-right text-sm"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">تاريخ الكشف</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white text-right text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-505 text-white rounded-2xl font-bold transition-all mt-6 shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  {editingExpense ? 'تثبيت تحديث التوثيق الميداني' : 'حفظ التقرير وإدراجه تلقائياً'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {isAddMemberOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsAddMemberOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-member-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-8 md:p-10 outline-none text-right"
              style={{ direction: 'rtl' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="add-member-title" className="text-xl font-bold text-white font-display">إرسال دعوة استكشاف لضابط ميداني</h3>
                <button 
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)} 
                  className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-zinc-400 text-xs mb-8">أدخل البريد الإلكتروني للضابط الميداني التابع للمركز لإلحاقه بكتيبة هذا السجل والاطلاع لحظياً على البيانات المتوفرة.</p>
              
              {inviteError && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-2xl">
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-2xl flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-bounce" />
                  تمت مكاملة الضابط بنجاح في القطاع الحالي!
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">البريد الإلكتروني للضابط</label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => {
                      setNewMemberEmail(e.target.value);
                      setInviteError(null);
                    }}
                    className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-white text-right"
                    placeholder="officer@pmac.gov.ps"
                    required
                    disabled={inviteLoading || inviteSuccess}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={inviteLoading || inviteSuccess}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-505 text-white rounded-2xl font-bold transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 shadow-md active:scale-95"
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري الاستحضار والمطابقة...
                    </>
                  ) : (
                    'تأكيد الإلحاق بالكتيبة الميدانية'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-8 md:p-10 max-h-[90vh] overflow-y-auto outline-none text-right"
              style={{ direction: 'rtl' }}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="settings-title" className="text-xl font-bold text-white font-display">تكوين إعدادات القطاع الميداني</h3>
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)} 
                  className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleUpdateSettings} className="space-y-6">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-550 mb-4 font-mono">البيانات السيادية</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">اسم القطاع / الحقل</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">المسؤوليات الجغرافية والوصف الميداني</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-semibold resize-none h-24 text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-550 mb-4 font-mono font-black">الحدود التقديرية التخطيطية</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 tracking-widest mb-2">المساحة المستهدفة الأقصى للقطاع (م²)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-xs pointer-events-none">م²</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editMaxBudget}
                          onChange={(e) => setEditMaxBudget(e.target.value)}
                          placeholder="لا يوجد كاب مساحي تقديري"
                          className="w-full pr-10 pl-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono font-bold text-white text-right"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 tracking-widest mb-2">نمط الحساب الفتراتي</label>
                      <select
                        value={editBudgetType}
                        onChange={(e) => setEditBudgetType(e.target.value as BudgetType)}
                        className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-white text-right"
                      >
                        <option value="weekly">تطهير أسبوعي مستمر</option>
                        <option value="monthly">تطهير شهري تدريجي</option>
                        <option value="total">إجمالي خطة القطاع الكلي</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <button
                    type="submit"
                    className="w-full py-4.5 bg-emerald-600 hover:bg-emerald-505 text-white rounded-2xl font-bold transition-all shadow-md active:scale-95"
                  >
                    حفظ وتحديث السياسات الأمنية
                  </button>

                  {(members.find(m => m.uid === user.uid)?.role === 'admin' || group?.createdBy === user.uid) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsDeleteGroupConfirmOpen(true);
                      }}
                      className="w-full py-4 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Trash2 className="w-5 h-5 shrink-0" />
                      مسح وإلغاء القطاع الميداني نهائياً
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* AI Analysis Modal */}
      <AnimatePresence>
        {isAnalysisModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={closeAnalysisModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={analysisModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="analysis-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-8 md:p-10 max-h-[85vh] overflow-y-auto outline-none text-right"
              style={{ direction: 'rtl' }}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-405 border border-emerald-500/20">
                  <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
                </div>
                <div>
                  <h3 id="analysis-title" className="text-xl font-bold text-white font-display">تقرير الاستشارة والتقييم الميداني الفوري</h3>
                  <p className="text-zinc-400 text-xs">تحليل أمني مدعوم بالذكاء الاصطناعي مكامل للقطاع الميداني: {group.name}</p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="py-20 flex flex-col items-center justify-center gap-6 text-zinc-500 text-center">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                    <div className="absolute inset-0 blur-lg bg-emerald-500/10" />
                  </div>
                  <p className="font-extrabold text-sm uppercase tracking-wider animate-pulse text-zinc-300">جاري مسح البؤر الأمنية وفك الشفرات التقديرية الحالية للذخائر...</p>
                </div>
              ) : (
                <div className="max-w-none text-right">
                  <div className="bg-zinc-950 rounded-[24px] p-6 text-sm text-zinc-200 border border-zinc-850 leading-relaxed max-h-[50vh] overflow-y-auto custom-scrollbar">
                    <div className="markdown-body text-right leading-loose">
                      <Markdown>{analysisResult || ""}</Markdown>
                    </div>
                  </div>
                  <button
                    onClick={closeAnalysisModal}
                    className="w-full py-4.5 bg-emerald-600 hover:bg-emerald-550 text-white rounded-2xl font-bold transition-all mt-6 shadow-md active:scale-95"
                  >
                    إغلاق التقرير وحفظه في الإرساليات
                  </button>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Group Confirmation Modal */}
      <AnimatePresence>
        {isDeleteGroupConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteGroupConfirmOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteGroupModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-group-title"
              aria-describedby="delete-group-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 text-center text-white outline-none"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-500/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 id="delete-group-title" className="text-xl font-bold text-white mb-2 font-display">مسح وإلغاء هذا القطاع نهائياً؟</h3>
              <p id="delete-group-desc" className="text-zinc-400 text-xs mb-8 leading-relaxed">أنت توجّه بحذف السجل الميداني لـ <strong>{group?.name}</strong> مضافاً لأجلها كافة البلاغات والتقارير المدرجة. هذا الإجراء الفني نهائي ولا يمكن التراجع عنه.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteGroupConfirmOpen(false)}
                  className="flex-1 py-3.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-2xl font-bold transition-all active:scale-95 text-sm"
                >
                  تراجع
                </button>
                <button
                  onClick={handleDeleteGroup}
                  className="flex-1 py-3.5 bg-red-650 hover:bg-red-600 text-white rounded-2xl font-bold transition-all shadow-md active:scale-95 text-sm"
                >
                  تأكيد المسح النهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stat Details Modal */}
      <AnimatePresence>
        {selectedStatDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStatDetails(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={statModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="stat-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-850 text-white rounded-[32px] p-8 md:p-10 text-center outline-none"
            >
              <p id="stat-title" className="text-xs font-black text-zinc-450 uppercase tracking-widest mb-4 font-display">{selectedStatDetails.title}</p>
              <p className="text-4xl sm:text-5xl font-black text-emerald-400 font-display tracking-tight mb-2 break-all">
                {selectedStatDetails.amount.toLocaleString()} م²
              </p>
              {selectedStatDetails.subtitle && (
                <p className="text-xs font-medium text-zinc-400 leading-relaxed mt-4">
                  {selectedStatDetails.subtitle}
                </p>
              )}
              <button
                onClick={() => setSelectedStatDetails(null)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-550 text-white rounded-2xl font-bold transition-all mt-8 shadow-md active:scale-95 text-sm"
              >
                تأكيد القراءة والعودة
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {expenseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 text-white rounded-[32px] p-8 text-center outline-none"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-500/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 id="delete-expense-title" className="text-xl font-bold text-white mb-2 font-display">حذف البلاغ المكتوب؟</h3>
              <p id="delete-expense-desc" className="text-zinc-400 text-xs mb-8 leading-relaxed">أنت بصدد التوجيه لمسح تقرير الذخائر المحدد. هذا الإجراء فني بحت ولا يمكن نقضه لاحقاً.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 py-3.5 bg-zinc-800 text-zinc-350 rounded-2xl font-bold transition-all active:scale-95 text-sm"
                >
                  إلغاء الأمر
                </button>
                <button
                  onClick={() => handleDeleteExpense(expenseToDelete)}
                  className="flex-1 py-3.5 bg-red-650 hover:bg-red-605 text-white rounded-2xl font-bold transition-all shadow-md active:scale-95 text-sm"
                >
                  تأكيد المسح
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      </div> {/* print:hidden CLOSING div */}

      {/* Export Report Drawer/Modal */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[32px] text-white p-8 md:p-10 outline-none text-right shadow-2xl"
              style={{ direction: 'rtl' }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-405">
                    <FileText className="w-5 h-5 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-white font-display">تصدير التقارير العملياتية</h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsExportModalOpen(false)} 
                  className="p-2 hover:bg-zinc-850 rounded-xl text-zinc-450 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-zinc-400 text-xs mb-6 leading-relaxed">توليد مستند فني رسمي مسير للعمل الميداني وهندسة المتفجرات والتوعوية بالتعاون مع منظومة الدفاع المدني.</p>

              <div className="space-y-4">
                {/* Text export card */}
                <button
                  onClick={() => {
                    downloadTextReport();
                    setIsExportModalOpen(false);
                  }}
                  className="w-full text-right p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:bg-zinc-850 hover:border-zinc-700 transition-all group flex items-start gap-4 cursor-pointer"
                >
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100 group-hover:text-emerald-400 transition-colors">تحميل كتقرير نصي فني (TXT)</h4>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">متوافق مع الطابعات الميدانية الصغيرة والأنظمة المتنقلة، يدون تفاصيل المعاينات والمهام تدريجياً.</p>
                  </div>
                </button>

                {/* PDF/Print report card */}
                <button
                  onClick={handlePrintReport}
                  className="w-full text-right p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:bg-zinc-850 hover:border-zinc-700 transition-all group flex items-start gap-4 cursor-pointer"
                >
                  <div className="w-10 h-10 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100 group-hover:text-teal-400 transition-colors">طباعة وتصدير كتقرير PDF رسمي</h4>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">وثيقة مروّسة صالحة للأرشفة والمشاركة الرسمية، مصممة على النسق المعتمد للمركز الفلسطيني.</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setIsExportModalOpen(false)}
                className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-2xl font-bold transition-all text-sm mt-6 active:scale-95 cursor-pointer"
              >
                إلغاء الأمر
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Printable Report Wrapper (Hidden in web, visible strictly during printing) */}
      <div className="hidden print:block w-full text-right text-black bg-white select-text font-sans p-10 leading-relaxed text-sm" style={{ direction: 'rtl' }}>
        {/* Emblem Board and Official Palestinian Authority Header */}
        <div className="border-b-4 border-double border-black pb-6 mb-8 text-center">
          <div className="flex justify-between items-center px-4 mb-2">
            <div className="text-right text-[10px] font-bold text-neutral-600">
              <p>دولة فلسطين</p>
              <p>وزارة الداخلية والأمن الوطني</p>
              <p>المركز الفلسطيني لإزالة الألغام (PMAC)</p>
            </div>
            <div className="px-3 py-1.5 border-2 border-black rounded-xl font-black text-black tracking-tight text-xs bg-neutral-50 shrink-0">
               PMAC العمليات
            </div>
            <div className="text-left text-[10px] font-sans font-bold text-neutral-600" style={{ direction: 'ltr' }}>
              <p>State of Palestine</p>
              <p>Ministry of Interior</p>
              <p>Palestinian Mine Action Center</p>
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-4 text-black font-display">تقرير الحالة العملياتية وتصنيف التهديدات</h1>
          <p className="text-[10px] text-neutral-500 font-bold mt-1">وثيقة صادرة ومحققة وفق بروتوكولات المسح الفني والمعايير الدولية للألغام (IMAS)</p>
        </div>

        {/* Core Metadata */}
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 border border-neutral-300 p-4 rounded-xl mb-6 bg-neutral-50">
          <div><strong className="text-xs">الموقع الفني للقطاع:</strong> <span className="text-xs font-semibold">{group.name}</span></div>
          <div><strong className="text-xs">تصنيف الحقل عملياتياً:</strong> <span className="text-xs font-semibold">
            {group.type === 'personal' ? 'قطاع عالي الخطورة' :
             group.type === 'trip' ? 'حقل مسح طارئ' :
             group.type === 'household' ? 'منطقة زراعية مأهولة' : 'موقع إنشائي'}
          </span></div>
          <div><strong className="text-xs">تاريخ استخراج التقرير:</strong> <span className="text-xs font-semibold font-mono">{new Date().toLocaleDateString('ar-PS')}</span></div>
          <div><strong className="text-xs">المشرف المسؤول:</strong> <span className="text-xs font-semibold">{members.find(m => m.uid === group.createdBy)?.displayName || user.displayName}</span></div>
          <div><strong className="text-xs">المساحة المصابة المرصودة:</strong> <span className="text-xs font-bold font-mono">{totalAreaInfected.toLocaleString()} م²</span></div>
          <div><strong className="text-xs">الحد المستهدف للقطاع:</strong> <span className="text-xs font-mono">{group.maxBudget ? `${group.maxBudget.toLocaleString()} م²` : 'غير محدد'}</span></div>
          <div className="col-span-2">
            <strong className="text-xs">الوصف الفني الجغرافي للقطاع:</strong>
            <p className="text-neutral-750 text-xs mt-1 bg-white p-2 border border-neutral-200 rounded leading-relaxed">{group.description || 'لم يتم إدراج وصف عملياتي تفصيلي لهذا القطاع الميداني بعد.'}</p>
          </div>
        </div>

        {/* Demining checklist / readiness */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-2 pb-1 border-b border-neutral-300">أولاً: الجاهزية وبروتوكول السلامة الميداني (IMAS)</h2>
          <div className="text-[11px] text-neutral-850 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
            <p className="mb-2 font-bold text-neutral-900">
              كفاءة المعاينة والتأمين المنجزة بالقطاع: {Math.round(((group.checklist || defaultChecklist).filter(item => item.checked).length / (group.checklist || defaultChecklist).length) * 100)}%
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(group.checklist || defaultChecklist).map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className={`text-[10px] font-black shrink-0 ${item.checked ? 'text-green-750 font-bold' : 'text-neutral-400'}`}>
                    [{item.checked ? '✔ مكتمل' : '✖ معلق'}]
                  </span>
                  <span className="text-[10px] text-neutral-600 truncate">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Field Notes and Directives */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-2 pb-1 border-b border-neutral-300">ثانياً: الملاحظات والتوجيهات الفنية لغرفة العمليات</h2>
          {(!group.notes || group.notes.length === 0) ? (
            <p className="text-xs italic text-neutral-500">لا توجد توجيهات أولية أو استشهادات مكتوبة للقطاع بالوقت الحالي.</p>
          ) : (
            <div className="space-y-2 border border-neutral-200 rounded-xl p-3 bg-neutral-50">
              {group.notes.map((note) => (
                <div key={note.id} className="pb-2 border-b border-neutral-200 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center text-[10px] text-neutral-500 mb-1 font-semibold">
                    <span>الضابط المدون: {note.author} ({note.role})</span>
                    <span className="font-mono">
                      {note.timestamp instanceof Timestamp 
                        ? note.timestamp.toDate().toLocaleString('ar-PS')
                        : new Date(note.timestamp as any).toLocaleString('ar-PS')
                      }
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-800">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Threat Tables (The essential logs!) */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3 pb-1 border-b border-neutral-300">ثالثاً: تفاصيل سجل الذخائر والمخلفات المرصودة</h2>
          {expenses.length === 0 ? (
            <p className="text-xs italic text-neutral-500 text-center py-4">القطاع نظيف وخالٍ تماماً من التهديدات المسجلة حالياً.</p>
          ) : (
            <table className="w-full text-right border-collapse border border-neutral-300 text-[11px]">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-300">
                  <th className="border border-neutral-300 p-2 font-bold w-12 text-center">#</th>
                  <th className="border border-neutral-300 p-2 font-bold">تفصيل وتوصيف التهديد المكتشف</th>
                  <th className="border border-neutral-300 p-2 font-bold w-24">التصنيف الفني</th>
                  <th className="border border-neutral-300 p-2 font-bold w-28 text-left border-l border-neutral-300">المساحة المقدرة م²</th>
                  <th className="border border-neutral-300 p-2 font-bold w-24 text-center">تاريخ الكشف</th>
                  <th className="border border-neutral-300 p-2 font-bold w-24 border-r border-neutral-300">الضابط الراصد</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense, idx) => (
                  <tr key={expense.id} className="border-b border-neutral-300">
                    <td className="border border-neutral-300 p-2 text-center font-bold">{idx + 1}</td>
                    <td className="border border-neutral-300 p-2 font-semibold text-neutral-900">{expense.description}</td>
                    <td className="border border-neutral-300 p-2 text-neutral-700">{expense.category}</td>
                    <td className="border border-neutral-300 p-2 text-left font-mono font-bold">{expense.amount.toLocaleString()} م²</td>
                    <td className="border border-neutral-300 p-2 text-center font-mono">{expense.date.toDate().toLocaleDateString('ar-PS')}</td>
                    <td className="border border-neutral-300 p-2 text-neutral-600">{members.find(m => m.uid === expense.paidBy)?.displayName || 'مستكشف PMAC'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Command Authorization Sign-off section */}
        <div className="mt-12 pt-8 border-t border-dashed border-neutral-400">
          <div className="flex justify-between px-8 text-neutral-700">
            <div className="text-center">
              <p className="text-[11px] font-bold">توقيع مشرف القطاع الميداني</p>
              <br />
              <p className="text-[10px] text-neutral-400">---------------------------------</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-bold">مدير هندسة المتفجرات العام</p>
              <br />
              <p className="text-[10px] text-neutral-400">---------------------------------</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
