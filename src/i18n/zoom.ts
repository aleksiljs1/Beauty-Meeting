/** Zoom-related UI text (Albanian). */
export const zoomText = {
  warnings: {
    syncFailed: "Mësimi u ruajt, por takimi në Zoom nuk u përditësua. Kontrolloni orarin në Zoom ose provoni përsëri.",
    deleteFailed: "Mësimi u anulua, por takimi në Zoom nuk u fshi. Fshijeni manualisht në Zoom.",
  },
  admin: {
    sectionTitle: "Klasa live në Zoom",
    createMeeting: "Krijo takimin Zoom",
    createTitle: "Të krijohet takimi në Zoom?",
    createDescription:
      "Krijohet një takim në llogarinë Zoom të akademisë dhe lidhet me këtë mësim. Takimi nuk nis automatikisht; studentët hyjnë vetëm përmes faqes së mësimit.",
    created: "Takimi Zoom u krijua.",
    meetingNumber: "Numri i takimit Zoom",
    sync: "Rifresko statusin nga Zoom",
    synced: "Statusi u rifreskua nga Zoom.",
    needsMeeting: "Krijoni fillimisht takimin Zoom për këtë mësim.",
    needsPublish: "Publikoni mësimin para se të nisni klasën live.",
    demoLesson: "Kjo është klasë demo. Përdorni kontrollet e simulimit.",
    finished: "Ky takim ka përfunduar ose ka një gabim dhe nuk mund të niset nga kjo faqe.",
    notLive: "Zoom nuk është aktivizuar (ZOOM_MODE=demo). Takimet reale krijohen vetëm në modalitetin live.",
    start: "Nis klasën live",
    rejoin: "Rihyr si host",
    connecting: "Po lidhemi me Zoom…",
    joined: "Jeni lidhur me Zoom si host.",
    left: "U larguat nga takimi.",
    note: "Studentët njoftohen automatikisht kur Zoom konfirmon fillimin e mësimit.",
    frameTitle: "Klasa live në Zoom",
    hostError: "Nuk mund të autorizohet host-i.",
  },
  frame: {
    genericError: "Nuk mund të lidhemi me Zoom. Provoni përsëri.",
    invalidResponse: "Përgjigjja e serverit për hyrjen në klasë është e pavlefshme.",
  },
} as const;
