import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../core/services/users.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserDto, CreateUserRequest } from '../../core/models/auth.model';

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="users-page">
      <div class="page-header">
        <div>
          <h1>{{ i18n.t('app.users') }}</h1>
          <p>إدارة حسابات فريق العمل وتحديد الصلاحيات (Admin / Agent)</p>
        </div>

        <button class="btn btn-primary" (click)="showCreateModal.set(true)">
          + إضافة مستخدم جديد
        </button>
      </div>

      <div class="table-container card">
        <table>
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>البريد الإلكتروني</th>
              <th>الصلاحية</th>
              <th>الحالة</th>
              <th>تاريخ الإنشاء</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            @if (isLoading()) {
              <tr>
                <td colspan="6" class="text-center py-4">{{ i18n.t('common.loading') }}</td>
              </tr>
            } @else {
              @for (user of users(); track user.id) {
                <tr>
                  <td class="font-bold">{{ user.fullName }}</td>
                  <td>{{ user.email }}</td>
                  <td>
                    <span class="badge" [ngClass]="user.role === 'Admin' ? 'badge-info' : 'badge-secondary'">
                      {{ user.role }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [ngClass]="user.isActive ? 'badge-success' : 'badge-danger'">
                      {{ user.isActive ? 'نشط' : 'معطل' }}
                    </span>
                  </td>
                  <td>{{ user.createdAt | date:'shortDate' }}</td>
                  <td>
                    <button 
                      class="btn btn-outline btn-sm" 
                      [ngClass]="user.isActive ? 'text-danger' : 'text-success'"
                      (click)="toggleActive(user)"
                    >
                      {{ user.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب' }}
                    </button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (showCreateModal()) {
        <div class="modal-backdrop">
          <div class="modal-card card">
            <h3>إضافة مستخدم جديد</h3>
            
            <div class="form-group">
              <label>الاسم الكامل</label>
              <input type="text" [(ngModel)]="newUser.fullName" class="input-control" />
            </div>

            <div class="form-group">
              <label>البريد الإلكتروني</label>
              <input type="email" [(ngModel)]="newUser.email" class="input-control" />
            </div>

            <div class="form-group">
              <label>كلمة المرور المؤقتة</label>
              <input type="password" [(ngModel)]="newUser.password" class="input-control" />
            </div>

            <div class="form-group">
              <label>الصلاحية</label>
              <select [(ngModel)]="newUser.role" class="input-control">
                <option value="Agent">وكيل عقاري (Agent)</option>
                <option value="Admin">مدير نظام (Admin)</option>
              </select>
            </div>

            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="showCreateModal.set(false)">إلغاء</button>
              <button class="btn btn-primary" (click)="createUser()">حفظ</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .users-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      h1 {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text-main, #f8fafc);
      }

      p {
        font-size: 0.875rem;
        color: var(--text-muted, #94a3b8);
      }
    }

    .btn-sm {
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
    }

    .text-danger {
      color: #ef4444;
      border-color: #ef4444;
    }

    .text-success {
      color: #10b981;
      border-color: #10b981;
    }

    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;

      .modal-card {
        width: 100%;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background-color: #1e293b;

        h3 {
          font-size: 1.125rem;
          color: var(--text-main, #f8fafc);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;

          label {
            font-size: 0.8rem;
            color: var(--text-muted, #94a3b8);
          }
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }
      }
    }
  `]
})
export class UsersManagementComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  readonly i18n = inject(I18nService);

  readonly users = signal<UserDto[]>([]);
  readonly isLoading = signal(false);
  readonly showCreateModal = signal(false);

  newUser: CreateUserRequest = {
    email: '',
    password: '',
    fullName: '',
    role: 'Agent'
  };

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.usersService.getUsers().subscribe({
      next: (res) => {
        this.users.set(res.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  toggleActive(user: UserDto): void {
    const nextState = !user.isActive;
    this.usersService.patchUser(user.id, { isActive: nextState }).subscribe({
      next: () => {
        this.loadUsers();
      },
      error: () => {
        alert('تعذر تحديث حالة الحساب');
      }
    });
  }

  createUser(): void {
    if (!this.newUser.email || !this.newUser.password || !this.newUser.fullName) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    this.usersService.createUser(this.newUser).subscribe({
      next: () => {
        this.showCreateModal.set(false);
        this.newUser = { email: '', password: '', fullName: '', role: 'Agent' };
        this.loadUsers();
      },
      error: (err) => {
        alert('حدث خطأ أثناء إنشاء المستخدم: ' + (err?.error?.detail || err?.message));
      }
    });
  }
}
