/**
 * Teacher help page (/admin/ndihme), Albanian. Only describes what the site and Zoom actually
 * do; anything not yet tried against a real Zoom account is marked `untested`.
 */
export type HelpItem = { text: string; untested?: boolean };
export type HelpSection = { id: string; title: string; intro?: string; items: HelpItem[] };

export const helpText = {
  title: "Ndihmë për mësuesen",
  intro:
    "Udhëzime të shkurtra për klasat live në Zoom. Pikat e shënuara \"E patestuar\" nuk janë provuar ende me llogarinë reale Zoom të akademisë.",
  untested: "E patestuar",
  contents: "Përmbajtja",
  sections: [
    {
      id: "nisja",
      title: "Si ta nisni klasën",
      intro: "Hapni Mësimet → mësimin → seksionin \"Klasa live në Zoom\". Klasa mund të niset në çdo kohë para përfundimit të orarit.",
      items: [
        {
          text: "Në shfletues (rekomandohet për mësime të zakonshme): klikoni \"Nis klasën live\". Takimi hapet brenda faqes, pa instaluar asgjë.",
        },
        {
          text: "Në aplikacionin Zoom në kompjuter: klikoni \"Nis në aplikacionin Zoom\", pastaj \"Hap aplikacionin Zoom\". Lidhja vlen vetëm për pak kohë; nëse nuk funksionon, kërkoni një të re. Kërkon aplikacionin Zoom të instaluar.",
          untested: true,
        },
        { text: "Studentët njoftohen automatikisht sapo Zoom konfirmon që takimi ka filluar." },
        { text: "Nëse statusi në faqe nuk përputhet me Zoom-in, përdorni \"Rifresko statusin nga Zoom\"." },
      ],
    },
    {
      id: "video",
      title: "Si të shfaqni një video me zë",
      items: [
        {
          text: "Mënyra e rekomanduar: nisni klasën në aplikacionin Zoom në kompjuter, pastaj Share Screen → Advanced → Video dhe zgjidhni skedarin MP4. Zoom e luan videon me zë për të gjithë studentët.",
          untested: true,
        },
        {
          text: "Në shfletues: ndani një skedë (tab) të shfletuesit ku luhet videoja dhe aktivizoni ndarjen e zërit të skedës, aty ku shfletuesi e lejon (zakonisht Chrome ose Edge në kompjuter). Mos u mbështetni te kjo mënyrë para se ta provoni.",
          untested: true,
        },
      ],
    },
    {
      id: "kontrollet",
      title: "Kamera, mikrofoni, chat-i, ngritja e dorës",
      items: [
        { text: "Këto janë kontrollet e vetë Zoom-it, në shiritin e takimit — jo funksione të faqes sonë." },
        { text: "Studentët hyjnë me kamerë të fikur; secili mund ta ndezë vetë nga Zoom-i." },
        { text: "Chat-i dhe ngritja e dorës funksionojnë si në çdo takim Zoom.", untested: true },
      ],
    },
    {
      id: "materialet",
      title: "Skedarët dhe materialet",
      items: [
        { text: "Skedarët e dërguar në chat-in e Zoom-it NUK ruhen në faqe dhe nuk i shohin studentët që shikojnë regjistrimin më vonë." },
        { text: "Ngarkoni çdo skedar të rëndësishëm te mësimi → skeda \"Materialet\". Studentët i gjejnë aty, edhe gjatë klasës, edhe më vonë deri në afatin e tyre." },
      ],
    },
    {
      id: "regjistrimet",
      title: "Regjistrimet",
      items: [
        { text: "Tani: shkarkoni regjistrimin si MP4 dhe ngarkojeni te mësimi → skeda \"Regjistrimet\". Studentët e shohin deri në afatin e tyre." },
        { text: "Më vonë: importim automatik i regjistrimeve nga Zoom Cloud. Kjo ende nuk ekziston dhe kërkon planin Zoom Pro." },
      ],
    },
    {
      id: "studentet",
      title: "Çfarë shohin studentët",
      items: [
        { text: "Në faqen e mësimit: klasën live brenda faqes dhe, anash, materialet, informacionin dhe regjistrimet." },
        {
          text: "Nëse klasa nuk hapet në pajisjen e tyre, studentët kanë një mundësi rezervë: \"Hap në aplikacionin Zoom\". Ajo kontrollon të njëjtat të drejta (regjistrimi, afati, orari) si klasa brenda faqes.",
          untested: true,
        },
        { text: "Lidhja e aplikacionit Zoom është lidhja e vetë takimit: kushdo që e ka mund ta përdorë sa kohë takimi është i hapur. Për këtë arsye çdo kërkesë regjistrohet te Historiku." },
      ],
    },
    {
      id: "mbarimi",
      title: "Mbarimi i klasës dhe afatet",
      items: [
        { text: "Kur afati i një studenti skadon ose ia hiqni aksesin, ai nuk mund të hyjë më nga faqja — por nëse është tashmë në takim, NUK nxirret automatikisht." },
        { text: "Për ta mbyllur klasën për të gjithë: në Zoom, End → End Meeting for All. Zoom i nxjerr të gjithë dhe faqja e shënon mësimin si të përfunduar." },
        { text: "Për të nxjerrë vetëm një person: në Zoom, Participants → pranë emrit → Remove.", untested: true },
      ],
    },
  ] satisfies HelpSection[],
} as const;
