import { Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService, UserFilterParams } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserDto, CreateUserRequest } from '../../core/models/auth.model';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';

@Component({
  selector: 'app-agents-management',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="agents-page" [dir]="i18n.dir()">
      @if (!authService.isAdmin()) {
        <div class="unauthorized-card card">
          <div class="lock-icon">🔒</div>
          <h2>صلاحية مقيدة: مدير النظام فقط</h2>
          <p>صفحة إدارة فريق الوكلاء والمستخدمين متاحة حصرياً لمدير النظام (Admin).</p>
        </div>
      } @else {
        <!-- Page Header -->
        <div class="page-header">
          <div>
            <div class="title-row">
              <h1>إدارة فريق الوكلاء والمستخدمين</h1>
              <span class="admin-badge">Admin Only</span>
            </div>
            <p class="subtitle">
              إدارة الحسابات، تعيين الصلاحيات، وتعطيل الحسابات مع إبطال فوري للجلسات النشطة
            </p>
          </div>

          <button type="button" class="btn btn-primary" (click)="openCreateModal()">
            + إضافة وكيل جديد
          </button>
        </div>

        <!-- Filters & Search Toolbar -->
        <div class="toolbar card">
          <div class="search-box">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="searchTerm.set($event)"
              class="input-control search-input"
              placeholder="بحث بالاسم أو البريد الإلكتروني..."
            />
            @if (searchQuery) {
              <button type="button" class="clear-btn" (click)="searchQuery = ''; searchTerm.set('')">✕</button>
            }
          </div>

          <div class="filters-row">
            <select [(ngModel)]="selectedRole" (ngModelChange)="roleFilter.set($event)" class="input-control select-ctrl">
              <option value="">جميع الصلاحيات</option>
              <option value="Agent">وكيل عقاري (Agent)</option>
              <option value="Admin">مدير نظام (Admin)</option>
            </select>

            <select [(ngModel)]="selectedActiveStatus" (ngModelChange)="onActiveFilterChange()" class="input-control select-ctrl">
              <option value="">جميع الحالات</option>
              <option value="true">نشط فقط</option>
              <option value="false">معطل فقط</option>
            </select>

            <select [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()" class="input-control select-ctrl size-ctrl">
              <option [ngValue]="10">10 / صفحة</option>
              <option [ngValue]="25">25 / صفحة</option>
              <option [ngValue]="50">50 / صفحة</option>
            </select>
          </div>
        </div>

        <!-- Agents Table -->
        <div class="table-container card">
          <table>
            <thead>
              <tr>
                <th>المستخدم / الوكيل</th>
                <th>البريد الإلكتروني</th>
                <th>الهاتف</th>
                <th>الصلاحية</th>
                <th>الحالة</th>
                <th>تاريخ الإنشاء</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              @if (isLoading()) {
                <tr>
                  <td colspan="7" class="text-center py-5">
                    <div class="loader-box">
                      <div class="spinner"></div>
                      <span>{{ i18n.t('common.loading') }}</span>
                    </div>
                  </td>
                </tr>
              } @else if (filteredUsers().length === 0) {
                <tr>
                  <td colspan="7" class="text-center py-5 empty-box">
                    <p>لا يوجد وكلاء يطابقون معايير البحث</p>
                    @if (hasActiveFilters()) {
                      <button type="button" class="btn btn-outline btn-sm mt-2" (click)="resetFilters()">إعادة ضبط الفلاتر</button>
                    }
                  </td>
                </tr>
              } @else {
                @for (user of filteredUsers(); track user.id) {
                  <tr class="agent-row">
                    <td>
                      <div class="user-cell">
                        <div class="avatar" [ngClass]="user.role === 'Admin' ? 'admin' : 'agent'">
                          {{ getInitials(user.fullName) }}
                        </div>
                        <div>
                          <div class="user-name">{{ user.fullName }}</div>
                          <div class="user-id">#{{ user.id.substring(0, 8) }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="email-text ltr">{{ user.email }}</span>
                    </td>
                    <td>
                      <span class="date-txt ltr">{{ user.officePhone || '—' }}</span>
                    </td>
                    <td>
                      <span class="badge" [ngClass]="user.role === 'Admin' ? 'badge-info' : 'badge-secondary'">
                        {{ user.role === 'Admin' ? 'مدير نظام (Admin)' : 'وكيل عقاري (Agent)' }}
                      </span>
                    </td>
                    <td>
                      <span class="badge" [ngClass]="user.isActive ? 'badge-success' : 'badge-danger'">
                        {{ user.isActive ? '● نشط' : '○ معطل' }}
                      </span>
                    </td>
                    <td>
                      <span class="date-txt">{{ user.createdAt | date:'mediumDate' }}</span>
                    </td>
                    <td>
                      <div class="actions-cell">
                        @if (user.isActive) {
                          <button
                            type="button"
                            class="btn btn-outline btn-sm btn-danger"
                            (click)="promptToggleActive(user)"
                            title="تعطيل الحساب وإلغاء جميع الجلسات"
                          >
                            ⛔ تعطيل الحساب
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="btn btn-outline btn-sm btn-success"
                            (click)="promptToggleActive(user)"
                            title="إعادة تفعيل الحساب"
                          >
                            ✅ تفعيل الحساب
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>

          <!-- Pagination Footer -->
          <div class="pagination-bar">
            <div class="page-info">
              إظهار {{ filteredUsers().length }} من إجمالي {{ totalCount() }} مستخدم (صفحة {{ currentPage }} من {{ totalPages() || 1 }})
            </div>
            <div class="page-nav">
              <button
                type="button"
                class="btn btn-outline btn-sm"
                [disabled]="currentPage <= 1 || isLoading()"
                (click)="onPageChange(currentPage - 1)"
              >
                السابق
              </button>
              <span class="page-num">{{ currentPage }}</span>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                [disabled]="currentPage >= totalPages() || isLoading()"
                (click)="onPageChange(currentPage + 1)"
              >
                التالي
              </button>
            </div>
          </div>
        </div>

        <!-- CREATE AGENT MODAL -->
        @if (showCreateModal()) {
          <div class="modal-mask" (click)="closeCreateModal()">
            <div class="modal-box" (click)="$event.stopPropagation()">
              <div class="box-head">
                <div>
                  <h2>إضافة وكيل / مستخدم جديد</h2>
                  <p class="sub-head">سيتم تفعيل الحساب فوراً</p>
                </div>
                <button type="button" class="close-x" (click)="closeCreateModal()">✕</button>
              </div>

              @if (createErrorMessage()) {
                <div class="err-box">⚠️ {{ createErrorMessage() }}</div>
              }

              <form (ngSubmit)="submitCreateUser()" class="create-form">
                <div class="form-row">
                  <label>الاسم الكامل *</label>
                  <input type="text" [(ngModel)]="newUser.fullName" name="fullName" class="input-control" maxlength="200" required />
                </div>

                <div class="form-row">
                  <label>البريد الإلكتروني *</label>
                  <input type="email" [(ngModel)]="newUser.email" name="email" class="input-control ltr" maxlength="256" required />
                </div>

                <div class="form-row">
                  <label>رقم الهاتف المكتبي (اختياري)</label>
                  <input type="tel" [(ngModel)]="newUser.officePhone" name="officePhone" class="input-control ltr" placeholder="+201000000000" />
                </div>

                <div class="form-row">
                  <label>كلمة المرور المؤقتة *</label>
                  <input type="password" [(ngModel)]="newUser.password" name="password" class="input-control ltr" minlength="8" required />
                  <small class="hint-txt">8 أحرف على الأقل</small>
                </div>

                <div class="form-row">
                  <label>الصلاحية *</label>
                  <select [(ngModel)]="newUser.role" name="role" class="input-control" required>
                    <option value="Agent">وكيل عقاري (Agent)</option>
                    <option value="Admin">مدير نظام (Admin)</option>
                  </select>
                </div>

                <div class="box-foot">
                  <button type="button" class="btn btn-secondary" (click)="closeCreateModal()">إلغاء</button>
                  <button type="submit" class="btn btn-primary" [disabled]="isSubmitting()">
                    {{ isSubmitting() ? 'جاري الإنشاء...' : 'إنشاء الحساب' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        }

        <!-- DEACTIVATE / REACTIVATE CONFIRMATION DIALOG -->
        @if (userToToggle()) {
          <div class="modal-mask" (click)="cancelToggleActive()">
            <div class="modal-box" (click)="$event.stopPropagation()">
              <div class="box-head">
                <div>
                  @if (userToToggle()!.isActive) {
                    <h2 class="text-danger">⚠️ تأكيد تعطيل حساب الوكيل</h2>
                  } @else {
                    <h2 class="text-success">✅ تأكيد إعادة تفعيل الحساب</h2>
                  }
                </div>
                <button type="button" class="close-x" (click)="cancelToggleActive()">✕</button>
              </div>

              <div class="confirm-body">
                <div class="target-card">
                  <div class="avatar" [ngClass]="userToToggle()!.role === 'Admin' ? 'admin' : 'agent'">
                    {{ getInitials(userToToggle()!.fullName) }}
                  </div>
                  <div>
                    <strong>{{ userToToggle()!.fullName }}</strong>
                    <div class="email-sub ltr">{{ userToToggle()!.email }}</div>
                  </div>
                </div>

                @if (userToToggle()!.isActive) {
                  <div class="warning-box">
                    <strong>🚨 تنبيه أمني وإلغاء فوري للجلسات:</strong>
                    <p>
                      سيؤدي تعطيل هذا الحساب فوراً إلى إلغاء وإبطال كافة جلسات تسجيل الدخول النشطة وتوكنات التحديث
                      <strong>(Revoke all user sessions & refresh tokens)</strong>.
                    </p>
                    <small>لن يتمكن الوكيل من الوصول إلى النظام حتى تتم إعادة تفعيل حسابه.</small>
                  </div>
                } @else {
                  <div class="reactivate-box">
                    <p>
                      هل أنت متأكد من رغبتك في إعادة تفعيل حساب الوكيل <strong>{{ userToToggle()!.fullName }}</strong>؟
                      سيتمكن فوراً من تسجيل الدخول والوصول لعقاراته.
                    </p>
                  </div>
                }
              </div>

              <div class="box-foot">
                <button type="button" class="btn btn-secondary" (click)="cancelToggleActive()">إلغاء</button>
                @if (userToToggle()!.isActive) {
                  <button
                    type="button"
                    class="btn btn-danger-solid"
                    [disabled]="isToggling()"
                    (click)="confirmToggleActive()"
                  >
                    {{ isToggling() ? 'جاري التعطيل...' : 'نعم، تعطيل الحساب وإلغاء الجلسات' }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="btn btn-primary"
                    [disabled]="isToggling()"
                    (click)="confirmToggleActive()"
                  >
                    {{ isToggling() ? 'جاري التفعيل...' : 'تأكيد تفعيل الحساب' }}
                  </button>
                }
              </div>
            </div>
          </div>
        }

        <!-- TOAST -->
        @if (toastMessage()) {
          <div class="toast" [ngClass]="toastType()">
            {{ toastMessage() }}
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .agents-page { display: flex; flex-direction: column; gap: 1rem; }
    .unauthorized-card { text-align: center; padding: 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; h2 { color: #f87171; margin: 0; } p { color: var(--text-muted); margin: 0; } }
    .page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; h1 { font-size: 1.5rem; margin: 0; } }
    .title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .admin-badge { font-size: 0.7rem; background: rgba(14,165,233,0.15); color: #38bdf8; border: 1px solid rgba(14,165,233,0.3); padding: 0.15rem 0.5rem; border-radius: 9999px; font-weight: 700; }
    .subtitle { font-size: 0.85rem; color: var(--text-muted); margin: 0.25rem 0 0 0; }
    .toolbar, .filters-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .select-ctrl { flex: 1; min-width: 140px; }
    .user-cell { display: flex; align-items: center; gap: 0.6rem; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; background: #334155; flex-shrink: 0; }
    .avatar.admin { color: #38bdf8; background: rgba(14,165,233,0.2); }
    .avatar.agent { color: #34d399; background: rgba(16,185,129,0.2); }
    .user-name { font-weight: 700; color: #f8fafc; font-size: 0.9rem; }
    .user-id { font-size: 0.72rem; color: var(--text-muted); font-family: monospace; }
    .email-text { color: var(--text-muted); font-size: 0.85rem; }
    .date-txt { font-size: 0.8rem; color: var(--text-muted); }
    .actions-cell, .page-nav { display: flex; gap: 0.4rem; align-items: center; }
    .btn-danger { color: #f87171 !important; border-color: rgba(239,68,68,0.4) !important; }
    .btn-success { color: #34d399 !important; border-color: rgba(16,185,129,0.4) !important; }
    .btn-danger-solid { background: #ef4444; color: #fff; font-weight: 700; }
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background: #0f172a; font-size: 0.8rem; flex-wrap: wrap; gap: 0.5rem; }
    .modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-box { width: 100%; max-width: 460px; background: #162032; border: 1px solid var(--border-color); border-radius: 0.75rem; display: flex; flex-direction: column; max-height: 92vh; overflow-y: auto; }
    .box-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; h2 { font-size: 1.15rem; margin: 0; } }
    .box-foot { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 0.5rem; }
    .create-form, .confirm-body { display: flex; flex-direction: column; gap: 0.875rem; padding: 1.25rem; }
    .form-row { display: flex; flex-direction: column; gap: 0.25rem; label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; } }
    .target-card { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #0f172a; border-radius: 0.5rem; border: 1px solid var(--border-color); }
    .email-sub { font-size: 0.78rem; color: var(--text-muted); }
    .warning-box { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35); padding: 0.75rem 1rem; border-radius: 0.5rem; color: #fca5a5; font-size: 0.825rem; line-height: 1.4; strong { color: #fecaca; } small { color: #f87171; display: block; margin-top: 0.25rem; } }
    .reactivate-box { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.85rem; color: #a7f3d0; p { margin: 0; } }
    .toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.25rem; border-radius: 0.5rem; font-weight: 700; z-index: 2000; &.success { background: #10b981; color: #fff; } &.error { background: #ef4444; color: #fff; } }
    .ltr { direction: ltr; text-align: left; }
    .text-center { text-align: center; }
    .py-5 { padding: 1.5rem 0; }
  `]
})
export class AgentsManagementComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly users = signal<UserDto[]>([]);
  readonly isLoading = signal(false);
  readonly totalCount = signal(0);
  readonly totalPages = signal(1);

  searchQuery = '';
  selectedRole = '';
  selectedActiveStatus = '';
  currentPage = 1;
  pageSize = 25;

  readonly searchTerm = signal('');
  readonly roleFilter = signal('');

  readonly filteredUsers = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter((u) => {
      if (role && u.role !== role) return false;
      if (q && !u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  readonly showCreateModal = signal(false);
  readonly isSubmitting = signal(false);
  readonly createErrorMessage = signal<string | null>(null);

  newUser: CreateUserRequest = {
    email: '',
    password: '',
    fullName: '',
    role: 'Agent',
    officePhone: ''
  };

  readonly userToToggle = signal<UserDto | null>(null);
  readonly isToggling = signal(false);

  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error'>('success');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (this.authService.isAdmin()) {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    this.isLoading.set(true);
    const filters: UserFilterParams = {
      isActive: this.selectedActiveStatus !== '' ? this.selectedActiveStatus === 'true' : undefined,
      page: this.currentPage,
      pageSize: this.pageSize
    };

    this.usersService.getUsers(filters).subscribe({
      next: (res) => {
        this.users.set(res.items || []);
        this.totalCount.set(res.totalCount || 0);
        this.totalPages.set(res.totalPages || 1);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showToast(extractApiErrorMessage(err, 'تعذر تحميل قائمة الوكلاء'), 'error');
      }
    });
  }

  onActiveFilterChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  onPageChange(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages()) return;
    this.currentPage = newPage;
    this.loadUsers();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedRole || this.selectedActiveStatus !== '');
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedRole = '';
    this.searchTerm.set('');
    this.roleFilter.set('');
    this.selectedActiveStatus = '';
    this.currentPage = 1;
    this.loadUsers();
  }

  openCreateModal(): void {
    this.newUser = {
      email: '',
      password: '',
      fullName: '',
      role: 'Agent',
      officePhone: ''
    };
    this.createErrorMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createErrorMessage.set(null);
  }

  submitCreateUser(): void {
    const fullName = this.newUser.fullName?.trim();
    const email = this.newUser.email?.trim();
    const password = this.newUser.password || '';

    if (!fullName || !email || !password) {
      this.createErrorMessage.set('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (password.length < 8) {
      this.createErrorMessage.set('كلمة المرور يجب أن لا تقل عن 8 أحرف');
      return;
    }

    this.isSubmitting.set(true);
    this.createErrorMessage.set(null);

    this.usersService.createUser({
      fullName,
      email,
      password,
      role: this.newUser.role,
      officePhone: this.newUser.officePhone?.trim() || undefined
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closeCreateModal();
        this.showToast('تم إنشاء حساب الوكيل بنجاح!', 'success');
        this.loadUsers();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.createErrorMessage.set(extractApiErrorMessage(err, 'حدث خطأ أثناء إنشاء الحساب'));
      }
    });
  }

  promptToggleActive(user: UserDto): void {
    this.userToToggle.set(user);
  }

  cancelToggleActive(): void {
    this.userToToggle.set(null);
    this.isToggling.set(false);
  }

  confirmToggleActive(): void {
    const user = this.userToToggle();
    if (!user) return;

    this.isToggling.set(true);
    const nextState = !user.isActive;

    this.usersService.patchUser(user.id, { isActive: nextState }).subscribe({
      next: () => {
        this.isToggling.set(false);
        const msg = nextState
          ? `تم تفعيل حساب الوكيل (${user.fullName}) بنجاح.`
          : `تم تعطيل حساب الوكيل (${user.fullName}) وإلغاء كافة جلسات تسجيل الدخول النشطة فورياً.`;
        this.userToToggle.set(null);
        this.showToast(msg, 'success');
        this.loadUsers();
      },
      error: (err) => {
        this.isToggling.set(false);
        this.showToast(extractApiErrorMessage(err, 'تعذر تحديث حالة الحساب'), 'error');
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }
}
