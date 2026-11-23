import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(I18nService);
  });

  it('should initialize with Arabic RTL by default', () => {
    expect(service.currentLang()).toBe('ar');
    expect(service.dir()).toBe('rtl');
    expect(service.isRtl()).toBe(true);
  });

  it('should toggle language to English LTR and back to Arabic RTL', () => {
    service.toggleLanguage();
    expect(service.currentLang()).toBe('en');
    expect(service.dir()).toBe('ltr');
    expect(service.isRtl()).toBe(false);

    service.toggleLanguage();
    expect(service.currentLang()).toBe('ar');
    expect(service.dir()).toBe('rtl');
  });

  it('should translate keys correctly', () => {
    service.setLanguage('ar');
    expect(service.t('app.title')).toBe('منصة العقارات 3D');

    service.setLanguage('en');
    expect(service.t('app.title')).toBe('RealEstate 3D Platform');
  });
});
