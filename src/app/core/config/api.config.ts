export const API_CONFIG = {
  baseUrl: 'http://localhost:5000/api/v1',
  viewerBaseUrl: 'http://localhost:3000',
  endpoints: {
    auth: {
      login: '/auth/login',
      refresh: '/auth/refresh',
      logout: '/auth/logout'
    },
    users: {
      list: '/admin/users',
      create: '/admin/users',
      patch: (id: string) => `/admin/users/${id}`
    },
    properties: {
      list: '/properties',
      create: '/properties',
      get: (id: string) => `/properties/${id}`,
      update: (id: string) => `/properties/${id}`,
      scans: (id: string) => `/properties/${id}/scans`,
      shareLinks: (id: string) => `/properties/${id}/share-links`,
      createShareLink: (id: string) => `/properties/${id}/share-links`,
      revokeShareLink: (linkId: string) => `/share-links/${linkId}`
    },
    scans: {
      get: (scanId: string) => `/scans/${scanId}`,
      preview: (scanId: string) => `/scans/${scanId}/preview`,
      dispatchToken: (scanId: string) => `/scans/${scanId}/dispatch-token`,
      retry: (scanId: string) => `/scans/${scanId}/retry`,
      sceneConfig: (scanId: string) => `/scans/${scanId}/scene-config`,
      publish: (scanId: string) => `/scans/${scanId}/publish`
    },
    public: {
      share: (token: string) => `/public/share/${token}`,
      viewBeacon: (token: string) => `/public/share/${token}/view`
    }
  }
};
