import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PropertiesService } from '../../core/services/properties.service';
import { I18nService } from '../../core/services/i18n.service';
import { PropertyDto } from '../../core/models/property.model';

@Component({
  selector: 'app-properties-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="properties-page">
      <div class="page-header">
        <div>
          <h1>{{ i18n.t('properties.title') }}</h1>
        </div>
      </div>

      <div class="filters-card card">
        <div class="filters-row">
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="onFilterChange()"
            class="input-control search-input" 
            [placeholder]="i18n.t('properties.search')"
          />

          <select [(ngModel)]="selectedDistrict" (ngModelChange)="onFilterChange()" class="input-control select-input">
            <option value="">{{ i18n.t('properties.allDistricts') }}</option>
            <option value="New Cairo">القاهرة الجديدة</option>
            <option value="Sheikh Zayed">الشيخ زايد</option>
            <option value="Maadi">المعادي</option>
            <option value="Nasr City">مدينة نصر</option>
            <option value="6th of October">السادس من أكتوبر</option>
          </select>

          <select [(ngModel)]="selectedStatus" (ngModelChange)="onFilterChange()" class="input-control select-input">
            <option value="">{{ i18n.t('properties.allStatuses') }}</option>
            <option value="Draft">مسودة</option>
            <option value="Active">نشط</option>
            <option value="Reserved">محجوز</option>
            <option value="Sold">تم البيع</option>
            <option value="Rented">تم التأجير</option>
          </select>

          <select [(ngModel)]="selectedType" (ngModelChange)="onFilterChange()" class="input-control select-input">
            <option value="">{{ i18n.t('properties.allTypes') }}</option>
            <option value="Sale">{{ i18n.t('properties.sale') }}</option>
            <option value="Rent">{{ i18n.t('properties.rent') }}</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>العقار</th>
              <th>الحي</th>
              <th>{{ i18n.t('properties.price') }}</th>
              <th>{{ i18n.t('properties.area') }}</th>
              <th>المواصفات</th>
              <th>{{ i18n.t('properties.status') }}</th>
              <th>{{ i18n.t('properties.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            @if (isLoading()) {
              <tr>
                <td colspan="7" class="text-center py-4">{{ i18n.t('common.loading') }}</td>
              </tr>
            } @else if (properties().length === 0) {
              <tr>
                <td colspan="7" class="text-center py-4">{{ i18n.t('properties.noProperties') }}</td>
              </tr>
            } @else {
              @for (prop of properties(); track prop.id) {
                <tr>
                  <td>
                    <div class="prop-title">{{ prop.title }}</div>
                    <div class="prop-id">{{ prop.city }}</div>
                  </td>
                  <td>{{ prop.district }}</td>
                  <td class="font-bold">{{ prop.price.toLocaleString() }} {{ prop.currency }}</td>
                  <td>{{ prop.areaSquareMeters }} م²</td>
                  <td>{{ prop.roomsCount }} غرف • {{ prop.bathroomsCount }} حمام</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusBadgeClass(prop.status)">
                      {{ prop.status }}
                    </span>
                  </td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-outline btn-sm" (click)="generateShareLink(prop.id)">
                        🔗 {{ i18n.t('properties.shareLink') }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .properties-page {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .page-header h1 {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text-main, #f8fafc);
    }

    .filters-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;

      .search-input {
        flex: 2;
        min-width: 220px;
      }

      .select-input {
        flex: 1;
        min-width: 150px;
      }
    }

    .prop-title {
      font-weight: 700;
      color: var(--text-main, #f8fafc);
    }

    .prop-id {
      font-size: 0.75rem;
      color: var(--text-muted, #94a3b8);
    }

    .font-bold {
      font-weight: 700;
      color: #34d399;
    }

    .btn-sm {
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
    }

    .text-center {
      text-align: center;
    }

    .py-4 {
      padding: 2rem 0;
    }
  `]
})
export class PropertiesListComponent implements OnInit {
  private readonly propertiesService = inject(PropertiesService);
  readonly i18n = inject(I18nService);

  readonly properties = signal<PropertyDto[]>([]);
  readonly isLoading = signal(false);

  searchQuery = '';
  selectedDistrict = '';
  selectedStatus = '';
  selectedType = '';

  ngOnInit(): void {
    this.loadProperties();
  }

  loadProperties(): void {
    this.isLoading.set(true);
    this.propertiesService.getProperties({
      search: this.searchQuery || undefined,
      district: this.selectedDistrict || undefined,
      status: this.selectedStatus || undefined,
      listingType: this.selectedType || undefined
    }).subscribe({
      next: (res) => {
        this.properties.set(res.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange(): void {
    this.loadProperties();
  }

  generateShareLink(propertyId: string): void {
    this.propertiesService.createShareLink(propertyId).subscribe({
      next: (link) => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(link.shareUrl);
          alert('تم نسخ رابط الجولة ثلاثية الأبعاد بنجاح:\n' + link.shareUrl);
        }
      },
      error: (err) => {
        alert('تعذر إنشاء رابط المشاركة: يجب أن يحتوي العقار على مسح 3D منشور (Published)');
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Active': return 'badge-success';
      case 'Reserved': return 'badge-warning';
      case 'Sold':
      case 'Rented': return 'badge-info';
      default: return 'badge-secondary';
    }
  }
}
