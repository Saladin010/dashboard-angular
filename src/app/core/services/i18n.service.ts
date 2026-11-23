import { Injectable, signal, computed, effect } from '@angular/core';

export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly STORAGE_KEY = 'realestate3d_lang';
  
  // Arabic RTL as default
  readonly currentLang = signal<Language>(this.getInitialLanguage());
  readonly dir = computed<Direction>(() => (this.currentLang() === 'ar' ? 'rtl' : 'ltr'));
  readonly isRtl = computed<boolean>(() => this.dir() === 'rtl');

  private translations: Record<Language, Record<string, any>> = {
    ar: {},
    en: {}
  };

  constructor() {
    this.initTranslations();
    
    // Sync DOM direction and language attribute
    effect(() => {
      const lang = this.currentLang();
      const direction = this.dir();
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
        document.documentElement.dir = direction;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, lang);
      }
    });
  }

  setLanguage(lang: Language): void {
    this.currentLang.set(lang);
  }

  toggleLanguage(): void {
    this.currentLang.set(this.currentLang() === 'ar' ? 'en' : 'ar');
  }

  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    const keys = key.split('.');
    let val: any = this.translations[lang];
    
    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        val = null;
        break;
      }
    }

    if (val === null || val === undefined) {
      // Fallback to key or English
      return key;
    }

    let text = String(val);
    if (params) {
      for (const [pKey, pVal] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{${pKey}}}`, 'g'), String(pVal));
      }
    }
    return text;
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.translate(key, params);
  }

  private getInitialLanguage(): Language {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY) as Language;
      if (stored === 'ar' || stored === 'en') {
        return stored;
      }
    }
    return 'ar';
  }

  private initTranslations(): void {
    // Bundled translations for immediate zero-latency reactive rendering
    this.translations.ar = {
      app: {
        title: 'منصة العقارات 3D',
        subtitle: 'لوحة إدارة العقارات والجولات ثلاثية الأبعاد',
        dashboard: 'لوحة التحكم',
        properties: 'العقارات',
        scans: 'مراقبة المسح 3D',
        users: 'فريق العمل',
        logout: 'تسجيل الخروج',
        arabic: 'العربية',
        english: 'English',
        admin: 'مدير النظام',
        agent: 'وكيل عقاري'
      },
      auth: {
        loginTitle: 'تسجيل الدخول إلى المنصة',
        loginSubtitle: 'أدخل بريدك الإلكتروني وكلمة المرور للمتابعة',
        email: 'البريد الإلكتروني',
        password: 'كلمة المرور',
        submit: 'دخول',
        signingIn: 'جاري التحقق...',
        deactivatedAlert: 'تم تعطيل هذا الحساب من قِبل إدارة النظام. يرجى التواصل مع المسؤول.',
        invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      },
      properties: {
        title: 'إدارة العقارات',
        search: 'بحث بالعنوان أو الحي...',
        allDistricts: 'جميع الأحياء',
        allStatuses: 'جميع الحالات',
        allTypes: 'الكل',
        sale: 'بيع',
        rent: 'إيجار',
        addProperty: 'إضافة عقار جديد',
        price: 'السعر',
        area: 'المساحة',
        rooms: 'الغرف',
        baths: 'الحمامات',
        floor: 'الدور',
        finishing: 'التشطيب',
        status: 'الحالة',
        actions: 'إجراءات',
        noProperties: 'لا توجد عقارات مطابقة للبحث',
        shareLink: 'مشاركة',
        view3D: 'معاينة 3D',
        owner: 'المالك'
      },
      scans: {
        title: 'مراقبة عمليات المسح ثلاثي الأبعاد',
        captureMode: 'نمط التصوير',
        status: 'حالة المعالجة',
        roomsProgress: 'تقدم الغرف',
        dispatchToken: 'توليد توكن Kaggle',
        retryRooms: 'إعادة معالجة الغرف الفاشلة',
        rawClipsExpiredNotice: 'لا يمكن إعادة المحاولة: انتهت صلاحية المقاطع الخام (30 يوماً)',
        studio: 'استوديو التحرير 3D',
        published: 'تم النشر',
        processing: 'قيد المعالجة'
      },
      common: {
        save: 'حفظ',
        cancel: 'إلغاء',
        edit: 'تعديل',
        delete: 'حذف',
        confirm: 'تأكيد',
        loading: 'جاري التحميل...',
        error: 'حدث خطأ غير متوقع',
        success: 'تمت العملية بنجاح'
      }
    };

    this.translations.en = {
      app: {
        title: 'RealEstate 3D Platform',
        subtitle: 'Apartment CRM & 3D Walkthrough Management',
        dashboard: 'Dashboard',
        properties: 'Properties',
        scans: '3D Scans Monitor',
        users: 'Team Users',
        logout: 'Sign Out',
        arabic: 'العربية',
        english: 'English',
        admin: 'Administrator',
        agent: 'Real Estate Agent'
      },
      auth: {
        loginTitle: 'Sign In to Platform',
        loginSubtitle: 'Enter your email and password to continue',
        email: 'Email Address',
        password: 'Password',
        submit: 'Sign In',
        signingIn: 'Authenticating...',
        deactivatedAlert: 'This account has been deactivated by administrator. Please contact your manager.',
        invalidCredentials: 'Invalid email or password'
      },
      properties: {
        title: 'Properties Management',
        search: 'Search title or district...',
        allDistricts: 'All Districts',
        allStatuses: 'All Statuses',
        allTypes: 'All Types',
        sale: 'For Sale',
        rent: 'For Rent',
        addProperty: 'New Property',
        price: 'Price',
        area: 'Area',
        rooms: 'Rooms',
        baths: 'Baths',
        floor: 'Floor',
        finishing: 'Finishing',
        status: 'Status',
        actions: 'Actions',
        noProperties: 'No properties found matching criteria',
        shareLink: 'Share',
        view3D: '3D Tour',
        owner: 'Owner'
      },
      scans: {
        title: '3D Scan Jobs Monitor',
        captureMode: 'Capture Mode',
        status: 'Job Status',
        roomsProgress: 'Rooms Progress',
        dispatchToken: 'Generate Kaggle Token',
        retryRooms: 'Retry Failed Rooms',
        rawClipsExpiredNotice: 'Cannot retry: Raw video clips have expired (30-day retention)',
        studio: '3D Studio',
        published: 'Published',
        processing: 'Processing'
      },
      common: {
        save: 'Save',
        cancel: 'Cancel',
        edit: 'Edit',
        delete: 'Delete',
        confirm: 'Confirm',
        loading: 'Loading...',
        error: 'An unexpected error occurred',
        success: 'Operation completed successfully'
      }
    };
  }
}
