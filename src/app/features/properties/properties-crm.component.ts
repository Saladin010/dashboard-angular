import { Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PropertiesService, PropertyFilterParams } from '../../core/services/properties.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { 
  PropertyDto, 
  PropertyInternalDto, 
  CreatePropertyRequestDto, 
  ShareLinkDto 
} from '../../core/models/property.model';

@Component({
  selector: 'app-properties-crm',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="crm-page" [dir]="i18n.dir()">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <div class="title-row">
            <h1>إدارة العقارات والعملاء (CRM)</h1>
            <span class="role-badge" [ngClass]="authService.isAdmin() ? 'admin' : 'agent'">
              {{ authService.isAdmin() ? 'مدير النظام (Admin)' : 'وكيل عقاري (Agent)' }}
            </span>
          </div>
          <p class="subtitle">سجل العقارات وتفاصيل الملاك المحمية وروابط المعاينة ثلاثية الأبعاد</p>
        </div>

        <button class="btn btn-primary" (click)="openCreateModal()">
          + إضافة عقار جديد
        </button>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="toolbar card">
        <div class="search-box">
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="onFilterChange()"
            class="input-control search-input" 
            placeholder="بحث بالعنوان، الحي، المدينة..."
          />
          @if (searchQuery) {
            <button class="clear-btn" (click)="searchQuery = ''; onFilterChange()">✕</button>
          }
        </div>

        <div class="filters-row">
          <select [(ngModel)]="selectedDistrict" (ngModelChange)="onFilterChange()" class="input-control select-ctrl">
            <option value="">جميع الأحياء</option>
            <option value="New Cairo">القاهرة الجديدة</option>
            <option value="Sheikh Zayed">الشيخ زايد</option>
            <option value="Maadi">المعادي</option>
            <option value="Nasr City">مدينة نصر</option>
            <option value="6th of October">السادس من أكتوبر</option>
            <option value="Heliopolis">مصر الجديدة</option>
          </select>

          <select [(ngModel)]="selectedStatus" (ngModelChange)="onFilterChange()" class="input-control select-ctrl">
            <option value="">جميع الحالات</option>
            <option value="Active">نشط (Active)</option>
            <option value="Draft">مسودة (Draft)</option>
            <option value="Reserved">محجوز (Reserved)</option>
            <option value="Sold">تم البيع (Sold)</option>
            <option value="Rented">تم التأجير (Rented)</option>
            <option value="Archived">مؤرشف (Archived)</option>
          </select>

          <select [(ngModel)]="selectedListingType" (ngModelChange)="onFilterChange()" class="input-control select-ctrl">
            <option value="">الكل (بيع وإيجار)</option>
            <option value="Sale">للبيع (Sale)</option>
            <option value="Rent">للإيجار (Rent)</option>
          </select>

          <select [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()" class="input-control select-ctrl size-ctrl">
            <option [ngValue]="10">10 / صفحة</option>
            <option [ngValue]="25">25 / صفحة</option>
            <option [ngValue]="50">50 / صفحة</option>
          </select>
        </div>
      </div>

      <!-- Properties Table -->
      <div class="table-container card">
        <table>
          <thead>
            <tr>
              <th>العقار</th>
              <th>الحي</th>
              <th>النوع</th>
              <th>السعر</th>
              <th>المواصفات</th>
              <th>التشطيب</th>
              <th>الحالة</th>
              <th>بيانات المالك</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            @if (isLoading()) {
              <tr>
                <td colspan="9" class="text-center py-5">
                  <div class="loader-box">
                    <div class="spinner"></div>
                    <span>{{ i18n.t('common.loading') }}</span>
                  </div>
                </td>
              </tr>
            } @else if (properties().length === 0) {
              <tr>
                <td colspan="9" class="text-center py-5 empty-box">
                  <p>لا توجد عقارات مطابقة لمعايير البحث</p>
                  @if (hasActiveFilters()) {
                    <button class="btn btn-outline btn-sm mt-2" (click)="resetFilters()">إعادة ضبط الفلاتر</button>
                  }
                </td>
              </tr>
            } @else {
              @for (prop of properties(); track prop.id) {
                <tr class="prop-row" (click)="openDetailDrawer(prop)">
                  <td>
                    <div class="prop-name">{{ prop.title }}</div>
                    <div class="prop-city">{{ prop.city }}</div>
                  </td>
                  <td>{{ prop.district }}</td>
                  <td>
                    <span class="type-tag" [ngClass]="prop.listingType === 'Sale' ? 'sale' : 'rent'">
                      {{ getListingTypeLabel(prop.listingType) }}
                    </span>
                  </td>
                  <td class="price-val">{{ prop.price.toLocaleString() }} {{ prop.currency }}</td>
                  <td class="specs-val">
                    {{ prop.areaSquareMeters }} م² • {{ prop.roomsCount }} غرف • {{ prop.bathroomsCount }} حمام
                  </td>
                  <td>{{ getFinishingLabel(prop.finishingType) }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusBadgeClass(prop.status)">
                      {{ getStatusLabel(prop.status) }}
                    </span>
                  </td>
                  <td>
                    @if (canViewPii(prop)) {
                      <span class="pii-tag open" title="مصرح بالاطلاع">🔓 متاح</span>
                    } @else {
                      <span class="pii-tag locked" title="محجوب للصلاحيات">🔒 محجوب</span>
                    }
                  </td>
                  <td (click)="$event.stopPropagation()">
                    <div class="actions-cell">
                      <button class="btn btn-outline btn-sm" (click)="openDetailDrawer(prop)">
                        👁️ التفاصيل
                      </button>
                      <button class="btn btn-primary btn-sm" (click)="generateShareLink(prop.id)">
                        🔗 مشاركة
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <!-- Pagination -->
        <div class="pagination-bar">
          <div class="page-info">
            إظهار {{ properties().length }} من إجمالي {{ totalCount() }} عقار (صفحة {{ pageIndex }} من {{ totalPages() || 1 }})
          </div>
          <div class="page-nav">
            <button 
              class="btn btn-outline btn-sm" 
              [disabled]="pageIndex <= 1 || isLoading()"
              (click)="onPageChange(pageIndex - 1)"
            >
              السابق
            </button>
            <span class="page-num">{{ pageIndex }}</span>
            <button 
              class="btn btn-outline btn-sm" 
              [disabled]="pageIndex >= totalPages() || isLoading()"
              (click)="onPageChange(pageIndex + 1)"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      <!-- DETAIL DRAWER / MODAL -->
      @if (selectedProperty()) {
        <div class="modal-mask" (click)="closeDetailDrawer()">
          <div class="drawer-box" (click)="$event.stopPropagation()">
            <div class="box-head">
              <div>
                <h2>{{ selectedProperty()!.title }}</h2>
                <div class="sub-head">
                  <span class="badge" [ngClass]="getStatusBadgeClass(selectedProperty()!.status)">
                    {{ getStatusLabel(selectedProperty()!.status) }}
                  </span>
                  <span>معرف: {{ selectedProperty()!.id }}</span>
                </div>
              </div>
              <button class="close-x" (click)="closeDetailDrawer()">✕</button>
            </div>

            <div class="box-body">
              @if (isDetailLoading()) {
                <div class="loader-box py-5">
                  <div class="spinner"></div>
                  <span>جاري تحميل التفاصيل الكاملة...</span>
                </div>
              } @else {
                <!-- Section 1: Specs -->
                <div class="sec-card">
                  <h3 class="sec-title">📐 المواصفات العامة للعقار</h3>
                  <div class="grid-2">
                    <div class="spec-tile">
                      <span class="lbl">السعر:</span>
                      <strong class="val price">{{ selectedProperty()!.price.toLocaleString() }} {{ selectedProperty()!.currency }}</strong>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">المساحة:</span>
                      <strong class="val">{{ selectedProperty()!.areaSquareMeters }} م²</strong>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">نوع العرض:</span>
                      <span class="val">{{ getListingTypeLabel(selectedProperty()!.listingType) }}</span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">المدينة والحي:</span>
                      <span class="val">{{ selectedProperty()!.city }} - {{ selectedProperty()!.district }}</span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">الغرف والحمامات:</span>
                      <span class="val">{{ selectedProperty()!.roomsCount }} غرف • {{ selectedProperty()!.bathroomsCount }} حمام</span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">التشطيب:</span>
                      <span class="val">{{ getFinishingLabel(selectedProperty()!.finishingType) }}</span>
                    </div>
                  </div>

                  @if (selectedProperty()!.publicDescription) {
                    <div class="desc-tile">
                      <span class="lbl">الوصف العام:</span>
                      <p>{{ selectedProperty()!.publicDescription }}</p>
                    </div>
                  }

                  <div class="tour-strip">
                    <div>
                      <strong>🪐 الجولة الافتراضية 3D</strong>
                      <p class="tour-sub">
                        {{ selectedProperty()!.activeScanId ? 'مسح 3D نشط متوفر' : 'لم يتم نشر مسح 3D بعد' }}
                      </p>
                    </div>
                    <div class="tour-btns">
                      @if (selectedProperty()!.activeScanId) {
                        <a [routerLink]="['/studio', selectedProperty()!.activeScanId]" class="btn btn-outline btn-sm">
                          الاستوديو 3D
                        </a>
                      }
                      <button class="btn btn-primary btn-sm" (click)="generateShareLink(selectedProperty()!.id)">
                        🔗 رابط مشاركة
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Section 2: Isolated PII -->
                <div class="sec-card pii-card">
                  <div class="pii-head">
                    <h3 class="sec-title pii-title">🔐 بيانات المالك والموقع (معزولة)</h3>
                    <span class="pii-badge">
                      {{ canViewPii(selectedProperty()!) ? 'مصرح' : 'محجوب' }}
                    </span>
                  </div>

                  @if (canViewPii(selectedProperty()!)) {
                    <div class="grid-2">
                      <div class="spec-tile">
                        <span class="lbl">اسم المالك:</span>
                        <strong class="val">{{ detailedProperty()?.privateDetails?.ownerName || 'غير مسجل' }}</strong>
                      </div>
                      <div class="spec-tile">
                        <span class="lbl">هاتف المالك:</span>
                        <div class="phone-box">
                          <a [href]="'tel:' + detailedProperty()?.privateDetails?.ownerPhone" class="phone-link">
                            {{ detailedProperty()?.privateDetails?.ownerPhone }}
                          </a>
                          <button class="btn btn-outline btn-sm" (click)="copyText(detailedProperty()!.privateDetails!.ownerPhone, 'تم نسخ رقم الهاتف!')">نسخ</button>
                        </div>
                      </div>
                      <div class="spec-tile col-span-2">
                        <span class="lbl">العنوان الدقيق:</span>
                        <strong class="val">{{ detailedProperty()?.privateDetails?.exactStreetAddress || 'غير محدد' }}</strong>
                      </div>
                      @if (detailedProperty()?.privateDetails?.latitude || detailedProperty()?.privateDetails?.longitude) {
                        <div class="spec-tile">
                          <span class="lbl">الإحداثيات:</span>
                          <span class="val ltr">{{ detailedProperty()?.privateDetails?.latitude }}, {{ detailedProperty()?.privateDetails?.longitude }}</span>
                        </div>
                      }
                      @if (detailedProperty()?.privateDetails?.googleMapsUrl) {
                        <div class="spec-tile">
                          <span class="lbl">خرائط جوجل:</span>
                          <a [href]="detailedProperty()?.privateDetails?.googleMapsUrl" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
                            🗺️ فتح الخريطة
                          </a>
                        </div>
                      }
                      @if (detailedProperty()?.privateDetails?.internalNotes) {
                        <div class="spec-tile col-span-2">
                          <span class="lbl">ملاحظات داخلية:</span>
                          <p class="notes-txt">{{ detailedProperty()?.privateDetails?.internalNotes }}</p>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="locked-banner">
                      <div class="lock-ico">🔒</div>
                      <h4>بيانات المالك محجوبة ومشفرة</h4>
                      <p>بيانات المالك والعنوان الدقيق والملاحظات تظهر حصرياً لمدير النظام (Admin) أو الوكيل المكلّف.</p>
                      <small>الوكيل المعين: {{ selectedProperty()!.assignedAgentId }}</small>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="box-foot">
              <button class="btn btn-secondary" (click)="closeDetailDrawer()">إغلاق</button>
            </div>
          </div>
        </div>
      }

      <!-- CREATE PROPERTY MODAL -->
      @if (showCreateModal()) {
        <div class="modal-mask" (click)="closeCreateModal()">
          <div class="modal-box large" (click)="$event.stopPropagation()">
            <div class="box-head">
              <div>
                <h2>إضافة عقار جديد مع بيانات المالك</h2>
                <p class="sub-head">أدخل المواصفات العامة وبيانات المالك المعزولة</p>
              </div>
              <button class="close-x" (click)="closeCreateModal()">✕</button>
            </div>

            @if (createErrorMessage()) {
              <div class="err-box">⚠️ {{ createErrorMessage() }}</div>
            }

            <form (ngSubmit)="submitCreateProperty()" class="create-form">
              <div class="form-sec">
                <h4>المواصفات العامة (Public)</h4>
                <div class="grid-2">
                  <div class="form-row col-span-2">
                    <label>عنوان العقار *</label>
                    <input type="text" [(ngModel)]="newProperty.title" name="title" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>نوع العرض *</label>
                    <select [(ngModel)]="newProperty.listingType" name="listingType" class="input-control" required>
                      <option value="Sale">للبيع (Sale)</option>
                      <option value="Rent">للإيجار (Rent)</option>
                    </select>
                  </div>
                  <div class="form-row">
                    <label>السعر المطلوب *</label>
                    <div class="addon-row">
                      <input type="number" [(ngModel)]="newProperty.price" name="price" class="input-control" required />
                      <select [(ngModel)]="newProperty.currency" name="currency" class="input-control w-24">
                        <option value="EGP">EGP</option>
                        <option value="USD">USD</option>
                        <option value="SAR">SAR</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row">
                    <label>المدينة *</label>
                    <input type="text" [(ngModel)]="newProperty.city" name="city" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>الحي / المنطقة *</label>
                    <input type="text" [(ngModel)]="newProperty.district" name="district" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>المساحة (م²) *</label>
                    <input type="number" [(ngModel)]="newProperty.areaSquareMeters" name="area" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>الدور</label>
                    <input type="number" [(ngModel)]="newProperty.floorNumber" name="floor" class="input-control" />
                  </div>
                  <div class="form-row">
                    <label>الغرف</label>
                    <input type="number" [(ngModel)]="newProperty.roomsCount" name="rooms" class="input-control" />
                  </div>
                  <div class="form-row">
                    <label>الحمامات</label>
                    <input type="number" [(ngModel)]="newProperty.bathroomsCount" name="baths" class="input-control" />
                  </div>
                  <div class="form-row col-span-2">
                    <label>التشطيب</label>
                    <select [(ngModel)]="newProperty.finishingType" name="finishing" class="input-control">
                      <option value="UltraSuperLux">ألترا سوبر لوكس</option>
                      <option value="FullyFinished">تشطيب كامل</option>
                      <option value="SemiFinished">نصف تشطيب</option>
                      <option value="CoreAndShell">طوب أحمر / عظم</option>
                    </select>
                  </div>
                  <div class="form-row col-span-2">
                    <label>الوصف العام</label>
                    <textarea [(ngModel)]="newProperty.publicDescription" name="desc" class="input-control" rows="2"></textarea>
                  </div>
                </div>
              </div>

              <!-- PII Fields -->
              <div class="form-sec pii-sec">
                <h4>🔒 بيانات المالك والموقع الدقيق (Isolated PII)</h4>
                <div class="grid-2">
                  <div class="form-row">
                    <label>اسم المالك *</label>
                    <input type="text" [(ngModel)]="newProperty.ownerName" name="ownerName" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>رقم هاتف المالك *</label>
                    <input type="tel" [(ngModel)]="newProperty.ownerPhone" name="ownerPhone" class="input-control ltr" required />
                  </div>
                  <div class="form-row col-span-2">
                    <label>العنوان التفصيلي الدقيق *</label>
                    <input type="text" [(ngModel)]="newProperty.exactStreetAddress" name="address" class="input-control" required />
                  </div>
                  <div class="form-row">
                    <label>خط العرض (Latitude)</label>
                    <input type="number" step="any" [(ngModel)]="newProperty.latitude" name="lat" class="input-control ltr" />
                  </div>
                  <div class="form-row">
                    <label>خط الطول (Longitude)</label>
                    <input type="number" step="any" [(ngModel)]="newProperty.longitude" name="lng" class="input-control ltr" />
                  </div>
                  <div class="form-row col-span-2">
                    <label>رابط خرائط جوجل</label>
                    <input type="url" [(ngModel)]="newProperty.googleMapsUrl" name="mapsUrl" class="input-control ltr" />
                  </div>
                  <div class="form-row col-span-2">
                    <label>ملاحظات داخلية خاصة</label>
                    <textarea [(ngModel)]="newProperty.internalNotes" name="notes" class="input-control" rows="2"></textarea>
                  </div>
                </div>
              </div>

              <div class="box-foot">
                <button type="button" class="btn btn-secondary" (click)="closeCreateModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="isSubmitting()">
                  {{ isSubmitting() ? 'جاري الحفظ...' : 'حفظ العقار' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- SHARE LINK MODAL -->
      @if (activeShareModal()) {
        <div class="modal-mask" (click)="closeShareModal()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="box-head">
              <div>
                <h2>🔗 رابط الجولة ثلاثية الأبعاد</h2>
                <p class="sub-head">رابط محمي لمعاينة العقار بدون إظهار بيانات المالك</p>
              </div>
              <button class="close-x" (click)="closeShareModal()">✕</button>
            </div>

            <div class="share-body">
              <div class="share-row">
                <input type="text" [value]="activeShareModal()!.shareUrl" readonly class="input-control ltr" />
                <button class="btn btn-primary" (click)="copyShareUrl()">
                  {{ isShareCopied() ? '✓ تم النسخ' : 'نسخ' }}
                </button>
              </div>
              <div class="share-meta">
                <span>المشاهدات: <strong>{{ activeShareModal()!.viewCount }}</strong></span>
                <span class="ltr">Token: {{ activeShareModal()!.token.substring(0, 12) }}...</span>
              </div>
            </div>

            <div class="box-foot">
              <button class="btn btn-secondary" (click)="closeShareModal()">إغلاق</button>
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
    </div>
  `,
  styles: [`
    .crm-page { display: flex; flex-direction: column; gap: 1rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; h1 { font-size: 1.5rem; margin: 0; } }
    .title-row { display: flex; align-items: center; gap: 0.75rem; }
    .subtitle { font-size: 0.85rem; color: var(--text-muted); margin: 0.25rem 0 0 0; }
    .role-badge, .type-tag, .pii-tag, .pii-badge { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 9999px; font-weight: 700; }
    .admin, .pii-badge { background: rgba(14,165,233,0.15); color: #38bdf8; }
    .agent, .open, .sale { background: rgba(16,185,129,0.15); color: #34d399; }
    .locked { background: rgba(148,163,184,0.1); color: #94a3b8; }
    .rent { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .toolbar, .filters-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .select-ctrl { flex: 1; min-width: 130px; }
    .prop-row { cursor: pointer; &:hover td { background: rgba(255,255,255,0.03); } }
    .prop-name { font-weight: 700; color: #f8fafc; }
    .prop-city { font-size: 0.75rem; color: var(--text-muted); }
    .price-val { font-weight: 700; color: #10b981; }
    .actions-cell, .page-nav { display: flex; gap: 0.4rem; align-items: center; }
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background: #0f172a; font-size: 0.8rem; }
    .modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .drawer-box { position: fixed; top: 0; bottom: 0; width: 100%; max-width: 580px; background: #162032; z-index: 1001; display: flex; flex-direction: column; overflow-y: auto; border-inline: 1px solid var(--border-color); }
    [dir='rtl'] .drawer-box { right: 0; }
    [dir='ltr'] .drawer-box { left: 0; }
    .modal-box { width: 100%; max-width: 480px; background: #162032; border: 1px solid var(--border-color); border-radius: 0.75rem; display: flex; flex-direction: column; &.large { max-width: 700px; max-height: 90vh; } }
    .box-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; h2 { font-size: 1.15rem; margin: 0; } }
    .box-body { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .box-foot { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 0.5rem; }
    .sec-card { background: #1e293b; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; &.pii-card { border: 2px solid #0284c7; background: #0c1a2e; } }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .col-2, .col-span-2 { grid-column: span 2; }
    .spec-tile { background: #0f172a; padding: 0.6rem; border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; .lbl { font-size: 0.7rem; color: var(--text-muted); } .val.price { color: #34d399; font-weight: 700; } }
    .tour-strip { background: #0f172a; border: 1px solid rgba(16,185,129,0.3); border-radius: 0.5rem; padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .phone-box { display: flex; align-items: center; gap: 0.5rem; a { color: #38bdf8; direction: ltr; font-weight: 700; } }
    .locked-banner { text-align: center; padding: 1.5rem; background: #0c1a2e; border-radius: 0.5rem; color: #f87171; h4 { margin: 0; } p { font-size: 0.8rem; color: var(--text-muted); } }
    .create-form { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; padding: 1rem; }
    .form-sec { background: #1e293b; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; &.pii-sec { border-color: #0284c7; background: #0c1a2e; h4 { color: #38bdf8; } } }
    .form-row { display: flex; flex-direction: column; gap: 0.25rem; label { font-size: 0.75rem; color: var(--text-muted); } }
    .toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.25rem; border-radius: 0.5rem; font-weight: 700; z-index: 2000; &.success { background: #10b981; color: #fff; } &.error { background: #ef4444; color: #fff; } }
    .ltr { direction: ltr; text-align: left; }
    .text-center { text-align: center; }
    .py-5 { padding: 1.5rem 0; }
  `]
})
export class PropertiesCrmComponent implements OnInit {
  private readonly propertiesService = inject(PropertiesService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly properties = signal<PropertyDto[]>([]);
  readonly isLoading = signal(false);
  readonly totalCount = signal(0);
  readonly totalPages = signal(1);

  searchQuery = '';
  selectedDistrict = '';
  selectedStatus = '';
  selectedListingType = '';
  pageIndex = 1;
  pageSize = 10;

  readonly selectedProperty = signal<PropertyDto | null>(null);
  readonly detailedProperty = signal<PropertyInternalDto | null>(null);
  readonly isDetailLoading = signal(false);

  readonly showCreateModal = signal(false);
  readonly isSubmitting = signal(false);
  readonly createErrorMessage = signal<string | null>(null);

  newProperty: CreatePropertyRequestDto = this.initEmptyPropertyForm();

  readonly activeShareModal = signal<ShareLinkDto | null>(null);
  readonly isShareCopied = signal(false);

  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error'>('success');
  private toastTimer: any;

  ngOnInit(): void {
    this.loadProperties();
  }

  loadProperties(): void {
    this.isLoading.set(true);
    const filters: PropertyFilterParams = {
      search: this.searchQuery.trim() || undefined,
      district: this.selectedDistrict || undefined,
      status: this.selectedStatus || undefined,
      listingType: this.selectedListingType || undefined,
      pageIndex: this.pageIndex,
      pageSize: this.pageSize
    };

    this.propertiesService.getProperties(filters).subscribe({
      next: (res) => {
        this.properties.set(res.items);
        this.totalCount.set(res.totalCount);
        this.totalPages.set(res.totalPages || 1);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.showToast('تعذر تحميل قائمة العقارات', 'error');
      }
    });
  }

  onFilterChange(): void {
    this.pageIndex = 1;
    this.loadProperties();
  }

  onPageSizeChange(): void {
    this.pageIndex = 1;
    this.loadProperties();
  }

  onPageChange(newPageIndex: number): void {
    if (newPageIndex < 1 || newPageIndex > this.totalPages()) return;
    this.pageIndex = newPageIndex;
    this.loadProperties();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedDistrict || this.selectedStatus || this.selectedListingType);
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedDistrict = '';
    this.selectedStatus = '';
    this.selectedListingType = '';
    this.pageIndex = 1;
    this.loadProperties();
  }

  canViewPii(prop: PropertyDto | PropertyInternalDto | null): boolean {
    if (!prop) return false;
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    return this.authService.isAdmin() || prop.assignedAgentId === currentUser.id;
  }

  openDetailDrawer(prop: PropertyDto): void {
    this.selectedProperty.set(prop);
    this.detailedProperty.set(null);
    this.isDetailLoading.set(true);

    this.propertiesService.getPropertyById(prop.id).subscribe({
      next: (full) => {
        this.detailedProperty.set(full);
        this.isDetailLoading.set(false);
      },
      error: () => {
        this.isDetailLoading.set(false);
      }
    });
  }

  closeDetailDrawer(): void {
    this.selectedProperty.set(null);
    this.detailedProperty.set(null);
  }

  openCreateModal(): void {
    this.newProperty = this.initEmptyPropertyForm();
    this.createErrorMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createErrorMessage.set(null);
  }

  submitCreateProperty(): void {
    if (!this.newProperty.title || !this.newProperty.city || !this.newProperty.district || !this.newProperty.price || !this.newProperty.areaSquareMeters) {
      this.createErrorMessage.set('يرجى ملء المواصفات العامة المطلوبة (العنوان، السعر، المساحة، المدينة، والحي)');
      return;
    }

    if (!this.newProperty.ownerName || !this.newProperty.ownerPhone || !this.newProperty.exactStreetAddress) {
      this.createErrorMessage.set('يرجى ملء بيانات المالك السرية المطلوبة (الاسم، رقم الهاتف، والعنوان الدقيق)');
      return;
    }

    this.isSubmitting.set(true);
    this.createErrorMessage.set(null);

    this.propertiesService.createProperty(this.newProperty).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closeCreateModal();
        this.showToast('تمت إضافة العقار وحفظ بيانات المالك بنجاح!', 'success');
        this.loadProperties();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const detail = err?.error?.detail || err?.message || 'حدث خطأ أثناء حفظ العقار';
        this.createErrorMessage.set(detail);
      }
    });
  }

  generateShareLink(propertyId: string): void {
    this.propertiesService.createShareLink(propertyId).subscribe({
      next: (shareLink) => {
        this.activeShareModal.set(shareLink);
        this.isShareCopied.set(false);
      },
      error: (err) => {
        const errorDetail = err?.error?.detail || '';
        if (err.status === 422 || errorDetail.toLowerCase().includes('publish')) {
          this.showToast('تعذر إنشاء الرابط: يجب أن يحتوي العقار على مسح ثلاثي الأبعاد منشور (Published) أولاً', 'error');
        } else {
          this.showToast('تعذر إنشاء رابط المشاركة: ' + (errorDetail || 'يرجى المحاولة لاحقاً'), 'error');
        }
      }
    });
  }

  closeShareModal(): void {
    this.activeShareModal.set(null);
    this.isShareCopied.set(false);
  }

  copyShareUrl(): void {
    const link = this.activeShareModal();
    if (!link) return;
    this.copyText(link.shareUrl, 'تم نسخ رابط الجولة بنجاح!');
    this.isShareCopied.set(true);
  }

  copyText(text: string, msg: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(msg, 'success');
      });
    } else {
      this.showToast(msg, 'success');
    }
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  private initEmptyPropertyForm(): CreatePropertyRequestDto {
    return {
      title: '',
      district: '',
      city: 'القاهرة',
      price: 0,
      currency: 'EGP',
      areaSquareMeters: 0,
      floorNumber: 1,
      roomsCount: 3,
      bathroomsCount: 2,
      finishingType: 'FullyFinished',
      listingType: 'Sale',
      publicDescription: '',
      ownerName: '',
      ownerPhone: '',
      exactStreetAddress: '',
      latitude: undefined,
      longitude: undefined,
      googleMapsUrl: '',
      internalNotes: ''
    };
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Active': return 'badge-success';
      case 'Reserved': return 'badge-warning';
      case 'Sold':
      case 'Rented': return 'badge-info';
      case 'Archived': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'Draft': return 'مسودة';
      case 'Active': return 'نشط';
      case 'Reserved': return 'محجوز';
      case 'Sold': return 'تم البيع';
      case 'Rented': return 'تم التأجير';
      case 'Archived': return 'مؤرشف';
      default: return status;
    }
  }

  getListingTypeLabel(type: string): string {
    switch (type) {
      case 'Sale': return 'للبيع';
      case 'Rent': return 'للإيجار';
      default: return type;
    }
  }

  getFinishingLabel(finishing: string): string {
    switch (finishing) {
      case 'CoreAndShell': return 'طوب أحمر / عظم';
      case 'SemiFinished': return 'نصف تشطيب';
      case 'FullyFinished': return 'تشطيب كامل';
      case 'UltraSuperLux': return 'ألترا سوبر لوكس';
      case 'Deluxe': return 'ديلوكس فاخر';
      default: return finishing;
    }
  }
}