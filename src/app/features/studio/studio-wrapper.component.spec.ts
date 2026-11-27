import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { StudioWrapperComponent } from './studio-wrapper.component';
import { API_CONFIG } from '../../core/config/api.config';
import { PropertyAssemblyStudioDto } from '../../core/models/scan.model';

describe('StudioWrapperComponent (Property Assembly Studio)', () => {
  let fixture: ComponentFixture<StudioWrapperComponent>;
  let component: StudioWrapperComponent;
  let httpTesting: HttpTestingController;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const propertyId = 'prop-1111-2222-3333-444444444444';
  const scan1Id = 'scan-1111-1111-1111-111111111111';
  const scan2Id = 'scan-2222-2222-2222-222222222222';

  function createStudioPayload(overrides?: Partial<PropertyAssemblyStudioDto>): PropertyAssemblyStudioDto {
    return {
      propertyId,
      propertyTitle: 'شقة التجمع الخامس',
      district: 'التجمع الخامس',
      city: 'القاهرة',
      assembly: {
        propertyId,
        status: 'Draft',
        version: 0,
        defaultInstanceId: '',
        eyeHeightMeters: 1.6,
        rooms: []
      },
      sessions: [
        {
          scanJobId: scan1Id,
          captureMode: 'RoomByRoom',
          status: 'ReadyForReview',
          createdAt: '2026-11-26T10:00:00Z',
          completedGlbRoomsCount: 2,
          rooms: [
            {
              scanJobId: scan1Id,
              roomId: 'living_room',
              roomLabel: 'الصالة',
              sortOrder: 0,
              status: 'Completed',
              outputR2Key: 'scans/1/living_room.glb',
              signedModelUrl: 'https://cdn.test/living_1.glb',
              gaussianCount: 450_000,
              isGlb: true,
              isSelectable: true
            },
            {
              scanJobId: scan1Id,
              roomId: 'hallway',
              roomLabel: 'الممر',
              sortOrder: 1,
              status: 'Completed',
              outputR2Key: 'scans/1/hallway.sog',
              signedModelUrl: 'https://cdn.test/hallway.sog',
              gaussianCount: 100_000,
              isGlb: false,
              isSelectable: false
            }
          ]
        },
        {
          scanJobId: scan2Id,
          captureMode: 'RoomByRoom',
          status: 'ReadyForReview',
          createdAt: '2026-11-27T10:00:00Z',
          completedGlbRoomsCount: 2,
          rooms: [
            {
              scanJobId: scan2Id,
              roomId: 'living_room',
              roomLabel: 'الصالة',
              sortOrder: 0,
              status: 'Completed',
              outputR2Key: 'scans/2/living_room.glb',
              signedModelUrl: 'https://cdn.test/living_2.glb',
              gaussianCount: 500_000,
              isGlb: true,
              isSelectable: true
            },
            {
              scanJobId: scan2Id,
              roomId: 'kitchen',
              roomLabel: 'المطبخ',
              sortOrder: 1,
              status: 'Completed',
              outputR2Key: 'scans/2/kitchen.glb',
              signedModelUrl: 'https://cdn.test/kitchen.glb',
              gaussianCount: 1_200_000,
              isGlb: true,
              isSelectable: true
            }
          ]
        }
      ],
      ...overrides
    };
  }

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ propertyId }));

    await TestBed.configureTestingModule({
      imports: [StudioWrapperComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { queryParamMap: convertToParamMap({}) }
          }
        }
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StudioWrapperComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
    fixture.destroy();
  });

  function bootstrapAssembly(payload = createStudioPayload()): void {
    fixture.detectChanges();
    const req = httpTesting.expectOne(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.assembly(propertyId)}`
    );
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    fixture.detectChanges();
  }

  it('should cherry-pick rooms across 2 sessions including duplicate roomId with unique instanceIds and editable labels', () => {
    bootstrapAssembly();

    const s1 = component.sessions()[0];
    const s2 = component.sessions()[1];
    expect(s1.rooms[1].isSelectable).toBe(false);

    // Add living_room from session 1 and duplicate roomId living_room from session 2
    component.addRoomFromSession(s1, s1.rooms[0]);
    component.addRoomFromSession(s2, s2.rooms[0]);

    const rooms = component.assembledRooms();
    expect(rooms.length).toBe(2);
    expect(rooms[0].instanceId).not.toBe(rooms[1].instanceId);
    expect(rooms[0].sourceScanId).toBe(scan1Id);
    expect(rooms[1].sourceScanId).toBe(scan2Id);
    expect(rooms[0].displayLabel).toBe('الصالة');
    expect(rooms[1].displayLabel).toBe('الصالة (2)');

    component.updateRoomDisplayLabel(rooms[1].instanceId, 'صالة الضيوف');
    expect(component.assembledRoomsMap().get(rooms[1].instanceId)?.displayLabel).toBe('صالة الضيوف');
    expect(component.isDirty()).toBe(true);
  });

  it('should trigger budget warning when triangles exceed 2M or rooms exceed 8', () => {
    bootstrapAssembly();
    const s1 = component.sessions()[0];
    const s2 = component.sessions()[1];

    // 450k + 500k = 950k <= 2M -> within budget
    component.addRoomFromSession(s1, s1.rooms[0]);
    component.addRoomFromSession(s2, s2.rooms[0]);
    expect(component.isOverBudget()).toBe(false);

    // + 1.2M = 2.15M > 2M -> triangle budget exceeded
    component.addRoomFromSession(s2, s2.rooms[1]);
    expect(component.estimatedTriangles()).toBe(2_150_000);
    expect(component.isTriangleBudgetExceeded()).toBe(true);
    expect(component.isOverBudget()).toBe(true);

    // Also verify room count budget (> 8 rooms)
    for (let i = 0; i < 6; i++) {
      component.addRoomFromSession(s1, { ...s1.rooms[0], gaussianCount: 1000 });
    }
    expect(component.assembledRooms().length).toBe(9);
    expect(component.isRoomBudgetExceeded()).toBe(true);
  });

  it('should sync transforms bidirectionally between numeric inputs and iframe postMessage events', () => {
    bootstrapAssembly();
    const s1 = component.sessions()[0];
    component.addRoomFromSession(s1, s1.rooms[0]);
    const instId = component.activeInstanceId();

    const postSpy = jasmine.createSpy('postMessage');
    (component as any).editorFrame = { nativeElement: { contentWindow: { postMessage: postSpy } } };

    // Numeric input -> outbound studio:setRoomTransform
    component.onTransformPositionChange(0, 3.25);
    component.onTransformRotationChange(1, 90);
    component.onTransformScaleChange(1.15);

    const updated = component.assembledRoomsMap().get(instId)!;
    expect(updated.transform.position[0]).toBe(3.25);
    expect(updated.transform.rotationEulerDeg[1]).toBe(90);
    expect(updated.transform.scale).toBe(1.15);
    expect(postSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: 'studio:setRoomTransform' }),
      '*'
    );

    // Inbound studio:roomTransformChanged -> updates state without echoing back
    postSpy.calls.reset();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'studio:roomTransformChanged',
          instanceId: instId,
          transform: { position: [5, 0, -2], rotationEulerDeg: [1.5, 45, 0], scale: 1.05 },
          isFinal: true
        }
      })
    );

    const synced = component.assembledRoomsMap().get(instId)!;
    expect(synced.transform.position).toEqual([5, 0, -2]);
    expect(synced.transform.rotationEulerDeg).toEqual([1.5, 45, 0]);
    expect(synced.transform.scale).toBe(1.05);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('should enforce unsaved-changes guard and handle 409 Conflict on save', () => {
    bootstrapAssembly();
    expect(component.canDeactivate()).toBe(true);

    const s1 = component.sessions()[0];
    component.addRoomFromSession(s1, s1.rooms[0]);
    expect(component.isDirty()).toBe(true);

    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    expect(component.canDeactivate()).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    component.onBeforeUnload(unloadEvent as BeforeUnloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);

    // Save -> 409 Conflict
    component.saveAssembly();
    const saveReq = httpTesting.expectOne(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.assembly(propertyId)}`
    );
    expect(saveReq.request.method).toBe('PUT');
    saveReq.flush(
      { detail: 'Version mismatch' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(component.conflictError()).toBeTruthy();
    expect(component.isDirty()).toBe(true);

    // Reload -> resolves conflict and clears dirty flag
    component.reloadLatestVersion();
    const reloadReq = httpTesting.expectOne(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.assembly(propertyId)}`
    );
    reloadReq.flush(createStudioPayload());
    expect(component.conflictError()).toBeNull();
    expect(component.isDirty()).toBe(false);
  });

  it('should issue only 1 HTTP request when /studio opens in picker mode (CRIT-04 fix)', () => {
    paramMap$.next(convertToParamMap({}));
    fixture.detectChanges();

    const propsReq = httpTesting.expectOne(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.list}?pageSize=20`
    );
    expect(propsReq.request.method).toBe('GET');
    propsReq.flush({
      items: [],
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalCount: 0,
      hasPreviousPage: false,
      hasNextPage: false
    });

    expect(component.studioMode()).toBe('picker');
  });
});
