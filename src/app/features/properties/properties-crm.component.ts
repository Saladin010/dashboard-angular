import { Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PropertiesService, PropertyFilterParams } from '../../core/services/properties.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { API_CONFIG } from '../../core/config/api.config';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';
import {
  PropertyDto,
  PropertyInternalDto,
  CreatePropertyRequestDto,
  ShareLinkDto
} from '../../core/models/property.model';
import { ScanJobDto, normalizeScanJobStatus, normalizeScanRoomStatus } from '../../core/models/scan.model';

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

        <button type="button" class="btn btn-primary" (click)="openCreateModal()">
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
            <button type="button" class="clear-btn" (click)="searchQuery = ''; onFilterChange()">✕</button>
          }
        </div>

        <div class="filters-row">
          <input
            type="text"
            [(ngModel)]="selectedDistrict"
            (ngModelChange)="onFilterChange()"
            class="input-control select-ctrl"
            placeholder="تصفية بالحي..."
          />

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
                    <button type="button" class="btn btn-outline btn-sm mt-2" (click)="resetFilters()">إعادة ضبط الفلاتر</button>
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
                    {{ prop.areaSqm }} م² • {{ prop.roomsCount }} غرف • {{ prop.bathroomsCount }} حمام
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
                      <button type="button" class="btn btn-outline btn-sm" (click)="openDetailDrawer(prop)">
                        👁️ التفاصيل
                      </button>
                      <button type="button" class="btn btn-primary btn-sm" (click)="generateShareLink(prop.id)">
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
            إظهار {{ properties().length }} من إجمالي {{ totalCount() }} عقار (صفحة {{ currentPage }} من {{ totalPages() || 1 }})
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

      <!-- DETAIL DRAWER / MODAL -->
      @if (selectedProperty()) {
        <div class="modal-mask" (click)="closeDetailDrawer()">
          <div class="drawer-box" (click)="$event.stopPropagation()">
            <div class="box-head">
              <div>
                <h2>{{ detailedProperty()?.title || selectedProperty()!.title }}</h2>
                <div class="sub-head">
                  <span class="badge" [ngClass]="getStatusBadgeClass(selectedProperty()!.status)">
                    {{ getStatusLabel(selectedProperty()!.status) }}
                  </span>
                  <span>معرف: {{ selectedProperty()!.id.substring(0, 8) }}...</span>
                </div>
              </div>
              <button type="button" class="close-x" (click)="closeDetailDrawer()">✕</button>
            </div>

            <div class="box-body">
              @if (isDetailLoading()) {
                <div class="loader-box py-5">
                  <div class="spinner"></div>
                  <span>جاري تحميل التفاصيل الكاملة...</span>
                </div>
              } @else {
                @let detail = detailedProperty();
                <!-- Section 1: Specs -->
                <div class="sec-card">
                  <div class="sec-head-row">
                    <h3 class="sec-title">📐 المواصفات العامة للعقار</h3>
                    @if (canViewPii(selectedProperty()!) && detail) {
                      <button type="button" class="btn btn-outline btn-sm" (click)="openEditModal(detail)">
                        ✏️ تعديل البيانات
                      </button>
                    }
                  </div>
                  <div class="grid-2">
                    <div class="spec-tile">
                      <span class="lbl">السعر:</span>
                      <strong class="val price">{{ (detail?.price ?? selectedProperty()!.price).toLocaleString() }} {{ detail?.currency || selectedProperty()!.currency }}</strong>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">المساحة:</span>
                      <strong class="val">{{ detail?.areaSqm ?? selectedProperty()!.areaSqm }} م²</strong>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">نوع العرض:</span>
                      <span class="val">{{ getListingTypeLabel(detail?.listingType || selectedProperty()!.listingType) }}</span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">المدينة والحي:</span>
                      <span class="val">{{ detail?.city || selectedProperty()!.city }} - {{ detail?.district || selectedProperty()!.district }}</span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">الغرف والحمامات والدور:</span>
                      <span class="val">
                        {{ detail?.roomsCount ?? selectedProperty()!.roomsCount }} غرف •
                        {{ detail?.bathroomsCount ?? selectedProperty()!.bathroomsCount }} حمام •
                        دور {{ detail?.floorNumber ?? selectedProperty()!.floorNumber }}
                      </span>
                    </div>
                    <div class="spec-tile">
                      <span class="lbl">التشطيب:</span>
                      <span class="val">{{ getFinishingLabel(detail?.finishingType || selectedProperty()!.finishingType) }}</span>
                    </div>
                  </div>

                  @if (detail?.publicDescription || selectedProperty()!.publicDescription) {
                    <div class="desc-tile">
                      <span class="lbl">الوصف العام:</span>
                      <p>{{ detail?.publicDescription || selectedProperty()!.publicDescription }}</p>
                    </div>
                  }

                  <div class="tour-strip">
                    <div>
                      <strong>🪐 الجولة الافتراضية 3D</strong>
                      <p class="tour-sub">
                        @if (latestScan()) {
                          حالة المسح: {{ getScanStatusLabel(latestScan()!.status) }}
                        } @else {
                          لم يتم تسجيل جلسة مسح 3D بعد
                        }
                      </p>
                    </div>
                    <div class="tour-btns">
                      @if (hasGlbRooms()) {
                        <a [routerLink]="['/studio/property', selectedProperty()!.id]" class="btn btn-outline btn-sm">
                          الاستوديو 3D
                        </a>
                      } @else if (latestScan()) {
                        <a [routerLink]="['/studio', latestScan()!.id]" class="btn btn-outline btn-sm">
                          الاستوديو 3D
                        </a>
                      }
                      @if (latestScan()) {
                        <a [routerLink]="['/scans']" [queryParams]="{ propertyId: selectedProperty()!.id, scanId: latestScan()!.id }" class="btn btn-outline btn-sm">
                          مراقبة المسح
                        </a>
                      }
                      <button type="button" class="btn btn-primary btn-sm" (click)="generateShareLink(selectedProperty()!.id)">
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

                  @if (canViewPii(selectedProperty()!) && detail) {
                    <div class="grid-2">
                      <div class="spec-tile">
                        <span class="lbl">اسم المالك:</span>
                        <strong class="val">{{ detail.ownerName || 'غير مسجل' }}</strong>
                      </div>
                      <div class="spec-tile">
                        <span class="lbl">هاتف المالك:</span>
                        <div class="phone-box">
                          <a [href]="'tel:' + detail.ownerPhone" class="phone-link">
                            {{ detail.ownerPhone }}
                          </a>
                          @if (detail.ownerPhone) {
                            <button type="button" class="btn btn-outline btn-sm" (click)="copyText(detail.ownerPhone, 'تم نسخ رقم الهاتف!')">نسخ</button>
                          }
                        </div>
                      </div>
                      <div class="spec-tile col-span-2">
                        <span class="lbl">العنوان الدقيق:</span>
                        <strong class="val">{{ detail.exactStreetAddress || 'غير محدد' }}</strong>
                      </div>

                      @if (hasLocation(detail)) {
                        <div class="spec-tile col-span-2">
                          <span class="lbl">الموقع الجغرافي:</span>
                          <div class="loc-saved-row">
                            <span class="loc-ok-badge">📍 تم حفظ الموقع الجغرافي</span>
                            <a [href]="getMapsHref(detail)" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
                              🗺️ فتح على الخريطة
                            </a>
                          </div>
                        </div>
                      }

                      @if (detail.internalNotes) {
                        <div class="spec-tile col-span-2">
                          <span class="lbl">ملاحظات داخلية:</span>
                          <p class="notes-txt">{{ detail.internalNotes }}</p>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="locked-banner">
                      <div class="lock-ico">🔒</div>
                      <h4>بيانات المالك محجوبة ومشفرة</h4>
                      <p>بيانات المالك والعنوان الدقيق والملاحظات تظهر حصرياً لمدير النظام (Admin) أو الوكيل المكلّف.</p>
                      <small>الوكيل المعين: {{ selectedProperty()!.assignedAgentName || selectedProperty()!.assignedAgentId }}</small>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="box-foot">
              <button type="button" class="btn btn-secondary" (click)="closeDetailDrawer()">إغلاق</button>
            </div>
          </div>
        </div>
      }

      <!-- CREATE / EDIT PROPERTY MODAL -->
      @if (showFormModal()) {
        <div class="modal-mask" (click)="closeFormModal()">
          <div class="modal-box large" (click)="$event.stopPropagation()">
            <div class="box-head">
              <div>
                <h2>{{ editingPropertyId() ? 'تعديل بيانات العقار' : 'إضافة عقار جديد مع بيانات المالك' }}</h2>
                <p class="sub-head">أدخل المواصفات العامة وبيانات المالك المعزولة</p>
              </div>
              <button type="button" class="close-x" (click)="closeFormModal()">✕</button>
            </div>

            @if (formErrorMessage()) {
              <div class="err-box">⚠️ {{ formErrorMessage() }}</div>
            }

            <form (ngSubmit)="submitPropertyForm()" class="create-form">
              <div class="form-sec">
                <h4>المواصفات العامة (Public)</h4>
                <div class="grid-2">
                  <div class="form-row col-span-2">
                    <label>عنوان العقار *</label>
                    <input type="text" [(ngModel)]="propertyForm.title" name="title" class="input-control" maxlength="300" required />
                  </div>
                  <div class="form-row">
                    <label>نوع العرض *</label>
                    <select [(ngModel)]="propertyForm.listingType" name="listingType" class="input-control" required>
                      <option value="Sale">للبيع (Sale)</option>
                      <option value="Rent">للإيجار (Rent)</option>
                    </select>
                  </div>
                  <div class="form-row">
                    <label>السعر المطلوب *</label>
                    <div class="addon-row">
                      <input type="number" [(ngModel)]="propertyForm.price" name="price" class="input-control" min="1" required />
                      <select [(ngModel)]="propertyForm.currency" name="currency" class="input-control currency-select">
                        <option value="EGP">EGP</option>
                        <option value="USD">USD</option>
                        <option value="SAR">SAR</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row">
                    <label>المدينة *</label>
                    <input type="text" [(ngModel)]="propertyForm.city" name="city" class="input-control" maxlength="100" required />
                  </div>
                  <div class="form-row">
                    <label>الحي / المنطقة *</label>
                    <input type="text" [(ngModel)]="propertyForm.district" name="district" class="input-control" maxlength="100" required />
                  </div>
                  <div class="form-row">
                    <label>المساحة (م²) *</label>
                    <input type="number" [(ngModel)]="propertyForm.areaSqm" name="areaSqm" class="input-control" min="1" step="1" required />
                  </div>
                  <div class="form-row">
                    <label>الدور</label>
                    <input type="number" [(ngModel)]="propertyForm.floorNumber" name="floor" class="input-control" min="-5" max="200" />
                  </div>
                  <div class="form-row">
                    <label>الغرف</label>
                    <input type="number" [(ngModel)]="propertyForm.roomsCount" name="rooms" class="input-control" min="0" />
                  </div>
                  <div class="form-row">
                    <label>الحمامات</label>
                    <input type="number" [(ngModel)]="propertyForm.bathroomsCount" name="baths" class="input-control" min="0" />
                  </div>
                  <div class="form-row col-span-2">
                    <label>التشطيب</label>
                    <select [(ngModel)]="propertyForm.finishingType" name="finishing" class="input-control">
                      <option value="UltraSuperLux">ألترا سوبر لوكس</option>
                      <option value="Deluxe">ديلوكس فاخر</option>
                      <option value="FullyFinished">تشطيب كامل</option>
                      <option value="SemiFinished">نصف تشطيب</option>
                      <option value="CoreAndShell">طوب أحمر / عظم</option>
                    </select>
                  </div>
                  <div class="form-row col-span-2">
                    <label>الوصف العام</label>
                    <textarea [(ngModel)]="propertyForm.publicDescription" name="desc" class="input-control" rows="2"></textarea>
                  </div>
                </div>
              </div>

              <!-- PII Fields -->
              <div class="form-sec pii-sec">
                <h4>🔒 بيانات المالك والموقع الدقيق (Isolated PII)</h4>
                <div class="grid-2">
                  <div class="form-row">
                    <label>اسم المالك *</label>
                    <input type="text" [(ngModel)]="propertyForm.ownerName" name="ownerName" class="input-control" maxlength="200" required />
                  </div>
                  <div class="form-row">
                    <label>رقم هاتف المالك *</label>
                    <input type="tel" [(ngModel)]="propertyForm.ownerPhone" name="ownerPhone" class="input-control ltr" maxlength="50" required />
                  </div>
                  <div class="form-row col-span-2">
                    <label>العنوان التفصيلي الدقيق *</label>
                    <input type="text" [(ngModel)]="propertyForm.exactStreetAddress" name="address" class="input-control" maxlength="500" required />
                  </div>

                  <!-- One-Click Hidden Geolocation Capture -->
                  <div class="form-row col-span-2">
                    <label>الموقع الجغرافي (GPS)</label>
                    <div class="gps-capture-box">
                      <button
                        type="button"
                        class="btn gps-btn"
                        [class.captured]="hasCapturedLocation()"
                        [disabled]="isCapturingLocation()"
                        (click)="captureCurrentLocation()"
                      >
                        @if (isCapturingLocation()) {
                          <span>⏳ جاري تحديد موقعك...</span>
                        } @else if (hasCapturedLocation()) {
                          <span>✅ تم التقاط الموقع بنجاح (اضغط للتحديث)</span>
                        } @else {
                          <span>📍 التقاط الموقع تلقائياً (تحديد موقعي الآن)</span>
                        }
                      </button>

                      @if (hasCapturedLocation()) {
                        <button type="button" class="btn btn-outline btn-sm" (click)="clearCapturedLocation()" title="مسح الموقع">
                          مسح
                        </button>
                      }
                    </div>

                    @if (locationError()) {
                      <small class="gps-error">⚠️ {{ locationError() }}</small>
                    } @else if (hasCapturedLocation()) {
                      <small class="gps-hint">تم حفظ الموقع تلقائياً وسيتم إرساله مع بيانات العقار بشكل سري.</small>
                    }
                  </div>

                  <div class="form-row col-span-2">
                    <label>رابط خرائط جوجل (اختياري)</label>
                    <input type="url" [(ngModel)]="propertyForm.googleMapsUrl" name="mapsUrl" class="input-control ltr" placeholder="https://maps.google.com/..." />
                  </div>
                  <div class="form-row col-span-2">
                    <label>ملاحظات داخلية خاصة</label>
                    <textarea [(ngModel)]="propertyForm.internalNotes" name="notes" class="input-control" rows="2"></textarea>
                  </div>
                </div>
              </div>

              <div class="box-foot">
                <button type="button" class="btn btn-secondary" (click)="closeFormModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="isSubmitting()">
                  {{ isSubmitting() ? 'جاري الحفظ...' : (editingPropertyId() ? 'حفظ التعديلات' : 'حفظ العقار') }}
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
              <button type="button" class="close-x" (click)="closeShareModal()">✕</button>
            </div>

            <div class="share-body">
              <div class="share-row">
                <input type="text" [value]="getShareUrl(activeShareModal()!)" readonly class="input-control ltr" />
                <button type="button" class="btn btn-primary" (click)="copyShareUrl()">
                  {{ isShareCopied() ? '✓ تم النسخ' : 'نسخ' }}
                </button>
              </div>
              <div class="share-meta">
                <span>المشاهدات: <strong>{{ activeShareModal()!.viewCount }}</strong></span>
                <span class="ltr">Token: {{ activeShareModal()!.token.substring(0, 12) }}...</span>
              </div>
            </div>

            <div class="box-foot">
              <a [href]="getShareUrl(activeShareModal()!)" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
                🌐 فتح الجولة
              </a>
              <button type="button" class="btn btn-secondary" (click)="closeShareModal()">إغلاق</button>
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
    .title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .subtitle { font-size: 0.85rem; color: var(--text-muted); margin: 0.25rem 0 0 0; }
    .role-badge, .type-tag, .pii-tag, .pii-badge { font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: 9999px; font-weight: 700; }
    .admin, .pii-badge { background: rgba(14,165,233,0.15); color: #38bdf8; }
    .agent, .open, .sale { background: rgba(16,185,129,0.15); color: #34d399; }
    .locked { background: rgba(148,163,184,0.1); color: #94a3b8; }
    .rent { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .toolbar, .filters-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .select-ctrl { flex: 1; min-width: 130px; }
    .prop-row { cursor: pointer; &:hover td { background: rgba(255,255,255,0.03); } }
    .prop-name { font-weight: 700; color: #f8fafc; }
    .prop-city { font-size: 0.75rem; color: var(--text-muted); }
    .price-val { font-weight: 700; color: #10b981; white-space: nowrap; }
    .actions-cell, .page-nav { display: flex; gap: 0.4rem; align-items: center; }
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background: #0f172a; font-size: 0.8rem; flex-wrap: wrap; gap: 0.5rem; }
    .modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .drawer-box { position: fixed; top: 0; bottom: 0; width: 100%; max-width: 580px; background: #162032; z-index: 1001; display: flex; flex-direction: column; overflow-y: auto; border-inline: 1px solid var(--border-color); }
    [dir='rtl'] .drawer-box { right: 0; }
    [dir='ltr'] .drawer-box { left: 0; }
    .modal-box { width: 100%; max-width: 480px; background: #162032; border: 1px solid var(--border-color); border-radius: 0.75rem; display: flex; flex-direction: column; &.large { max-width: 720px; max-height: 92vh; } }
    .box-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; h2 { font-size: 1.15rem; margin: 0; } }
    .box-body { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .box-foot { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 0.5rem; }
    .sec-card { background: #1e293b; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; &.pii-card { border: 2px solid #0284c7; background: #0c1a2e; } }
    .sec-head-row, .pii-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .sec-title { font-size: 0.95rem; margin: 0; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .col-span-2 { grid-column: span 2; }
    .spec-tile { background: #0f172a; padding: 0.6rem; border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; .lbl { font-size: 0.7rem; color: var(--text-muted); } .val.price { color: #34d399; font-weight: 700; } }
    .tour-strip { background: #0f172a; border: 1px solid rgba(16,185,129,0.3); border-radius: 0.5rem; padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .tour-sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem; }
    .tour-btns { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .phone-box, .loc-saved-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; a { color: #38bdf8; direction: ltr; font-weight: 700; } }
    .loc-ok-badge { font-size: 0.8rem; color: #34d399; font-weight: 700; }
    .locked-banner { text-align: center; padding: 1.5rem; background: #0c1a2e; border-radius: 0.5rem; color: #f87171; h4 { margin: 0.4rem 0; } p { font-size: 0.8rem; color: var(--text-muted); } }
    .lock-ico { font-size: 1.5rem; }
    .create-form { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; padding: 1rem; }
    .form-sec { background: #1e293b; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; h4 { margin: 0; font-size: 0.92rem; } &.pii-sec { border-color: #0284c7; background: #0c1a2e; h4 { color: #38bdf8; } } }
    .form-row { display: flex; flex-direction: column; gap: 0.25rem; label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; } }
    .gps-capture-box { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .gps-btn { flex: 1; background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.45); color: #38bdf8; &:hover:not(:disabled) { background: rgba(14, 165, 233, 0.25); } &.captured { background: rgba(16, 185, 129, 0.18); border-color: rgba(16, 185, 129, 0.5); color: #34d399; } }
    .gps-hint { font-size: 0.73rem; color: #34d399; }
    .gps-error { font-size: 0.73rem; color: #f87171; }
    .share-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .share-row { display: flex; gap: 0.5rem; }
    .share-meta { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); }
    .toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.25rem; border-radius: 0.5rem; font-weight: 700; z-index: 2000; &.success { background: #10b981; color: #fff; } &.error { background: #ef4444; color: #fff; } }
    .ltr { direction: ltr; text-align: left; }
    .text-center { text-align: center; }
    .py-5 { padding: 1.5rem 0; }
    @media (max-width: 640px) {
      .grid-2 { grid-template-columns: 1fr; }
      .col-span-2 { grid-column: span 1; }
    }
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
  currentPage = 1;
  pageSize = 10;

  readonly selectedProperty = signal<PropertyDto | null>(null);
  readonly detailedProperty = signal<PropertyInternalDto | null>(null);
  readonly latestScan = signal<ScanJobDto | null>(null);
  readonly hasGlbRooms = signal<boolean>(false);
  readonly isDetailLoading = signal(false);

  readonly showFormModal = signal(false);
  readonly editingPropertyId = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly formErrorMessage = signal<string | null>(null);

  readonly isCapturingLocation = signal(false);
  readonly locationError = signal<string | null>(null);

  propertyForm: CreatePropertyRequestDto = this.initEmptyPropertyForm();

  readonly activeShareModal = signal<ShareLinkDto | null>(null);
  readonly isShareCopied = signal(false);

  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error'>('success');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadProperties();
  }

  loadProperties(): void {
    this.isLoading.set(true);
    const filters: PropertyFilterParams = {
      search: this.searchQuery.trim() || undefined,
      district: this.selectedDistrict.trim() || undefined,
      status: this.selectedStatus || undefined,
      listingType: this.selectedListingType || undefined,
      page: this.currentPage,
      pageSize: this.pageSize
    };

    this.propertiesService.getProperties(filters).subscribe({
      next: (res) => {
        this.properties.set(res.items || []);
        this.totalCount.set(res.totalCount || 0);
        this.totalPages.set(res.totalPages || 1);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.showToast(extractApiErrorMessage(err, 'تعذر تحميل قائمة العقارات'), 'error');
      }
    });
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadProperties();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadProperties();
  }

  onPageChange(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages()) return;
    this.currentPage = newPage;
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
    this.currentPage = 1;
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
    this.latestScan.set(null);
    this.hasGlbRooms.set(false);
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

    this.propertiesService.getPropertyScans(prop.id).subscribe({
      next: (scans) => {
        if (scans && scans.length > 0) {
          const published = scans.find((s) => normalizeScanJobStatus(s.status) === 'Published');
          this.latestScan.set(published || scans[0]);
          const hasGlb = scans.some(
            (s) =>
              normalizeScanJobStatus(s.status) !== 'Archived' &&
              (s.rooms || []).some(
                (r) =>
                  normalizeScanRoomStatus(r.status) === 'Completed' &&
                  (r.outputR2Key || '').toLowerCase().endsWith('.glb')
              )
          );
          this.hasGlbRooms.set(hasGlb);
        }
      },
      error: () => {}
    });
  }

  closeDetailDrawer(): void {
    this.selectedProperty.set(null);
    this.detailedProperty.set(null);
    this.latestScan.set(null);
    this.hasGlbRooms.set(false);
  }

  openCreateModal(): void {
    this.editingPropertyId.set(null);
    this.propertyForm = this.initEmptyPropertyForm();
    this.formErrorMessage.set(null);
    this.locationError.set(null);
    this.showFormModal.set(true);
  }

  openEditModal(detail: PropertyInternalDto): void {
    this.editingPropertyId.set(detail.id);
    this.propertyForm = {
      title: detail.title,
      district: detail.district,
      city: detail.city,
      listingType: detail.listingType,
      price: detail.price,
      currency: detail.currency || 'EGP',
      areaSqm: detail.areaSqm,
      floorNumber: detail.floorNumber,
      roomsCount: detail.roomsCount,
      bathroomsCount: detail.bathroomsCount,
      finishingType: detail.finishingType,
      publicDescription: detail.publicDescription || '',
      ownerName: detail.ownerName || '',
      ownerPhone: detail.ownerPhone || '',
      exactStreetAddress: detail.exactStreetAddress || '',
      latitude: detail.latitude ?? undefined,
      longitude: detail.longitude ?? undefined,
      googleMapsUrl: detail.googleMapsUrl || '',
      internalNotes: detail.internalNotes || ''
    };
    this.formErrorMessage.set(null);
    this.locationError.set(null);
    this.showFormModal.set(true);
  }

  closeFormModal(): void {
    this.showFormModal.set(false);
    this.editingPropertyId.set(null);
    this.formErrorMessage.set(null);
    this.locationError.set(null);
  }

  hasCapturedLocation(): boolean {
    return typeof this.propertyForm.latitude === 'number' && typeof this.propertyForm.longitude === 'number';
  }

  captureCurrentLocation(): void {
    this.locationError.set(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.locationError.set('المتصفح لا يدعم تحديد الموقع الجغرافي (Geolocation).');
      return;
    }

    this.isCapturingLocation.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.isCapturingLocation.set(false);
        this.propertyForm.latitude = Number(pos.coords.latitude.toFixed(6));
        this.propertyForm.longitude = Number(pos.coords.longitude.toFixed(6));
        if (!this.propertyForm.googleMapsUrl) {
          this.propertyForm.googleMapsUrl = `https://www.google.com/maps?q=${this.propertyForm.latitude},${this.propertyForm.longitude}`;
        }
        this.showToast('تم التقاط الموقع الجغرافي بنجاح!', 'success');
      },
      (err) => {
        this.isCapturingLocation.set(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            this.locationError.set('تم رفض إذن الوصول للموقع. يرجى السماح بالوصول للموقع من إعدادات المتصفح.');
            break;
          case err.POSITION_UNAVAILABLE:
            this.locationError.set('تعذر تحديد موقعك الحالي. تأكد من تفعيل خدمة الموقع (GPS).');
            break;
          case err.TIMEOUT:
            this.locationError.set('انتهت مهلة تحديد الموقع. يرجى المحاولة مرة أخرى.');
            break;
          default:
            this.locationError.set('تعذر الحصول على الموقع الجغرافي.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  clearCapturedLocation(): void {
    this.propertyForm.latitude = undefined;
    this.propertyForm.longitude = undefined;
    this.locationError.set(null);
  }

  hasLocation(detail: PropertyInternalDto): boolean {
    return !!(detail.googleMapsUrl || (detail.latitude != null && detail.longitude != null));
  }

  getMapsHref(detail: PropertyInternalDto): string {
    if (detail.googleMapsUrl) return detail.googleMapsUrl;
    return `https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`;
  }

  submitPropertyForm(): void {
    const title = this.propertyForm.title?.trim();
    const city = this.propertyForm.city?.trim();
    const district = this.propertyForm.district?.trim();
    const ownerName = this.propertyForm.ownerName?.trim();
    const ownerPhone = this.propertyForm.ownerPhone?.trim();
    const exactStreetAddress = this.propertyForm.exactStreetAddress?.trim();

    if (!title || !city || !district) {
      this.formErrorMessage.set('يرجى إدخال عنوان العقار، المدينة، والحي.');
      return;
    }

    if (!this.propertyForm.price || Number(this.propertyForm.price) <= 0) {
      this.formErrorMessage.set('يجب أن يكون السعر أكبر من 0.');
      return;
    }

    const areaInt = Math.round(Number(this.propertyForm.areaSqm));
    if (!areaInt || areaInt <= 0) {
      this.formErrorMessage.set('يجب أن تكون المساحة (م²) أكبر من 0.');
      return;
    }

    const floorInt = Math.round(Number(this.propertyForm.floorNumber ?? 0));
    if (floorInt < -5 || floorInt > 200) {
      this.formErrorMessage.set('رقم الدور يجب أن يكون بين -5 و 200.');
      return;
    }

    if (!ownerName || !ownerPhone || !exactStreetAddress) {
      this.formErrorMessage.set('يرجى ملء بيانات المالك المطلوبة (الاسم، رقم الهاتف، والعنوان التفصيلي).');
      return;
    }

    const payload: CreatePropertyRequestDto = {
      title,
      district,
      city,
      listingType: this.propertyForm.listingType || 'Sale',
      price: Number(this.propertyForm.price),
      currency: this.propertyForm.currency || 'EGP',
      areaSqm: areaInt,
      floorNumber: floorInt,
      roomsCount: Math.max(0, Math.round(Number(this.propertyForm.roomsCount ?? 0))),
      bathroomsCount: Math.max(0, Math.round(Number(this.propertyForm.bathroomsCount ?? 0))),
      finishingType: this.propertyForm.finishingType || 'FullyFinished',
      publicDescription: this.propertyForm.publicDescription?.trim() || undefined,
      ownerName,
      ownerPhone,
      exactStreetAddress,
      latitude: this.propertyForm.latitude ?? null,
      longitude: this.propertyForm.longitude ?? null,
      googleMapsUrl: this.propertyForm.googleMapsUrl?.trim() || undefined,
      internalNotes: this.propertyForm.internalNotes?.trim() || undefined
    };

    this.isSubmitting.set(true);
    this.formErrorMessage.set(null);

    const editId = this.editingPropertyId();
    const request$ = editId
      ? this.propertiesService.updateProperty(editId, payload)
      : this.propertiesService.createProperty(payload);

    request$.subscribe({
      next: (saved) => {
        this.isSubmitting.set(false);
        this.closeFormModal();
        if (editId && this.selectedProperty()?.id === editId) {
          this.detailedProperty.set(saved);
          this.selectedProperty.set(saved);
        }
        this.showToast(
          editId ? 'تم تحديث بيانات العقار بنجاح!' : 'تمت إضافة العقار وحفظ بيانات المالك بنجاح!',
          'success'
        );
        this.loadProperties();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.formErrorMessage.set(extractApiErrorMessage(err, 'حدث خطأ أثناء حفظ العقار'));
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
        const msg = extractApiErrorMessage(err, 'يرجى المحاولة لاحقاً');
        if (err.status === 422 || msg.toLowerCase().includes('publish')) {
          this.showToast('تعذر إنشاء الرابط: يجب أن يحتوي العقار على مسح ثلاثي الأبعاد منشور (Published) أولاً', 'error');
        } else {
          this.showToast('تعذر إنشاء رابط المشاركة: ' + msg, 'error');
        }
      }
    });
  }

  getShareUrl(link: ShareLinkDto): string {
    const viewerBase = (API_CONFIG.viewerBaseUrl || 'https://viewer-web.pages.dev').replace(/\/+$/, '');
    return `${viewerBase}/v/${link.token}`;
  }

  closeShareModal(): void {
    this.activeShareModal.set(null);
    this.isShareCopied.set(false);
  }

  copyShareUrl(): void {
    const link = this.activeShareModal();
    if (!link) return;
    this.copyText(this.getShareUrl(link), 'تم نسخ رابط الجولة بنجاح!');
    this.isShareCopied.set(true);
  }

  copyText(text: string, msg: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(msg, 'success');
      }).catch(() => this.showToast(msg, 'success'));
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
      price: 1000000,
      currency: 'EGP',
      areaSqm: 120,
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

  getScanStatusLabel(status: string | number): string {
    const s = normalizeScanJobStatus(status);
    switch (s) {
      case 'Published': return 'منشور 3D';
      case 'ReadyForReview': return 'جاهز للمراجعة';
      case 'Processing': return 'قيد المعالجة';
      case 'PendingProcessing': return 'بانتظار المعالجة';
      case 'Uploading': return 'جاري الرفع';
      case 'Failed': return 'فشل';
      default: return s;
    }
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
