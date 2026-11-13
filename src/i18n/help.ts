/**
 * The teacher's guide (/admin/ndihme), Albanian: one short guide per task, searchable, each with
 * the steps in the order she does them and a button to the page where it happens. Only describes
 * what the site and Zoom actually do; anything not yet tried with the academy's real Zoom account
 * is marked `untested`. Button and tab names match the admin pages word for word.
 */
export type HelpTip = { text: string; untested?: boolean };
export type HelpCategory = "start" | "lessons" | "live" | "students" | "payments" | "files" | "website" | "insight";
export type HelpGuide = {
  id: string;
  category: HelpCategory;
  title: string;
  /** Other words she might search with (no need to repeat the title). */
  keywords: string[];
  steps: string[];
  tips?: HelpTip[];
  link?: { href: string; label: string };
};

export const helpText = {
  title: "Ndihmë",
  intro: "Çfarë doni të bëni? Kërkoni me fjalët tuaja ose zgjidhni një temë. Çdo udhëzues ka hapat dhe një buton që ju çon në faqen e duhur.",
  searchLabel: "Kërko në udhëzues",
  searchPlaceholder: "p.sh. ftesë, pagesë, regjistrim, nis klasën…",
  clear: "Pastro kërkimin",
  allTopics: "Të gjitha",
  results: (n: number) => (n === 1 ? "1 udhëzues" : `${n} udhëzues`),
  noResults: "Asnjë udhëzues nuk përputhet. Provoni një fjalë tjetër, p.sh. “student”, “mësim” ose “pagesë”.",
  untested: "E patestuar",
  stepsLabel: "Hapat",
  tipsLabel: "Mirë të dini",
  copyLink: "Kopjo lidhjen e udhëzuesit",
  copied: "Lidhja u kopjua.",

  checklist: {
    title: "Hapat e parë",
    intro: "Akademia gati për studentët, hap pas hapi. Shenjat vendosen vetë sapo e bëni.",
    progress: (done: number, total: number) => `${done} nga ${total} gati`,
    allDone: "Gjithçka gati! Akademia është gati për studentët.",
    show: "Shiko si",
    open: "Hap",
    items: {
      settings: "Plotësoni të dhënat e akademisë (kontaktet, orari)",
      course: "Krijoni kursin e parë",
      billing: "Vendosni datën e fillimit dhe çmimin e kursit",
      student: "Shtoni studentët",
      lesson: "Krijoni dhe publikoni mësimin e parë",
      enrolled: "Futni studentët në mësim (nga kursi ose me ftesë)",
      zoom: "Lidhni Zoom-in me llogarinë e akademisë",
      gallery: "Ngarkoni foto në galeri",
      reminders: "Ndizni kujtesën me email para mësimeve",
    },
  },

  categories: {
    start: "Fillimi",
    lessons: "Mësimet",
    live: "Klasa live",
    students: "Studentët",
    payments: "Pagesat",
    files: "Materialet dhe regjistrimet",
    website: "Faqja e internetit",
    insight: "Statistikat dhe vlerësimet",
  } satisfies Record<HelpCategory, string>,

  guides: [
    // --- Fillimi -----------------------------------------------------------------------
    {
      id: "si-funksionon",
      category: "start",
      title: "Si funksionon portali, shkurt",
      keywords: ["fillim", "hyrje", "përmbledhje", "si punon"],
      steps: [
        "Kursi është grupi (p.sh. “Grim profesional”); studentët i caktoni te kursi.",
        "Mësimi është një klasë me datë dhe orë. Krijohet si draft dhe studentët e shohin vetëm kur e publikoni.",
        "Studentët e kursit zgjidhen vetë kur krijoni mësimin; të tjerët hyjnë me lidhjen e ftesës.",
        "Në orën e mësimit nisni klasën live; studentët njoftohen dhe hyjnë nga faqja.",
        "Pas klasës, regjistrimi shfaqet vetë te mësimi; materialet i ngarkoni te mësimi.",
        "Pagesat i regjistroni ju te “Pagesat”: portali llogarit kush është me vonesë.",
      ],
      link: { href: "/admin", label: "Hap panelin" },
    },
    {
      id: "te-dhenat",
      category: "start",
      title: "Plotësoni të dhënat e akademisë",
      keywords: ["kontakt", "telefon", "adresë", "orar", "whatsapp", "instagram", "emri", "slogan", "rreth nesh"],
      steps: [
        "Hapni Përmbajtja → Të dhënat e akademisë.",
        "Plotësoni emrin, sloganin dhe tekstin “Rreth nesh”.",
        "Shtoni telefonin, emailin, WhatsApp-in dhe adresën; lidhjen e hartës nga Google Maps.",
        "Te “Orari i punës” shtoni një rresht për çdo grup ditësh, p.sh. “E hënë – E premte · 09:00 – 19:00”.",
        "Ruani: ndryshimet shfaqen menjëherë në faqen publike.",
      ],
      link: { href: "/admin/permbajtja/te-dhenat", label: "Hap të dhënat" },
    },
    {
      id: "kujtesa",
      category: "start",
      title: "Merrni kujtesë me email para çdo mësimi",
      keywords: ["njoftim", "email", "harroj", "kujto", "alarm", "cilësimet"],
      steps: [
        "Hapni Cilësimet.",
        "Ndizni “Më dërgo kujtesë me email”.",
        "Zgjidhni sa kohë para (p.sh. 30 minuta ose 1 orë) dhe, nëse doni, një email tjetër.",
        "Klikoni “Ruaj”. Po aq kohë para, klasa shfaqet edhe në krye të panelit me butonin “Nis klasën”.",
      ],
      link: { href: "/admin/cilesimet", label: "Hap cilësimet" },
    },

    // --- Mësimet -------------------------------------------------------------------------
    {
      id: "kursi",
      category: "lessons",
      title: "Krijoni një kurs",
      keywords: ["kurs i ri", "grup", "abonim", "program"],
      steps: [
        "Hapni Përmbajtja → Kurset dhe klikoni “Shto kurs”.",
        "Shkruani titullin, një përmbledhje dhe, nëse doni, një foto.",
        "Te “Pagesat” vendosni datën e fillimit, kohëzgjatjen dhe çmimin mujor: pa to nuk regjistrohen pagesat.",
        "Ndizni “Shfaqe në faqen publike” nëse kursi duhet të duket te faqja “Akademia”.",
      ],
      tips: [{ text: "Fotoja e kursit përdoret edhe për mësimet e tij që nuk kanë foton e vet." }],
      link: { href: "/admin/permbajtja/kurset", label: "Hap kurset" },
    },
    {
      id: "mesimi",
      category: "lessons",
      title: "Krijoni një mësim",
      keywords: ["mësim i ri", "klasë", "orar", "datë", "planifiko", "draft"],
      steps: [
        "Hapni Mësimet → “Mësim i ri”.",
        "Shkruani titullin dhe zgjidhni kursin: studentët e kursit shfaqen të zgjedhur më poshtë.",
        "Vendosni fillimin, përfundimin dhe afatin e aksesit (deri kur shohin regjistrimin dhe materialet).",
        "Klikoni “Krijo mësimin”. Mësimi ruhet si draft.",
        "Kur jeni gati, hapni mësimin dhe klikoni “Publiko”: tani studentët e shohin.",
      ],
      tips: [
        { text: "“Hyrja hapet” është zakonisht 15 minuta para fillimit: studentët mund të hyjnë që nga ajo orë." },
        { text: "Një ditë pas afatit të aksesit, regjistrimet e mësimit fshihen vetë." },
      ],
      link: { href: "/admin/mesimet/i-ri", label: "Mësim i ri" },
    },
    {
      id: "seria",
      category: "lessons",
      title: "Mësim që përsëritet çdo javë",
      keywords: ["seri", "përsërit", "javor", "çdo javë", "data", "orar fiks"],
      steps: [
        "Te “Mësim i ri”, plotësoni mësimin e parë si zakonisht.",
        "Ndizni “Përsërite mësimin”, zgjidhni ditët e javës dhe datën e fundit.",
        "Shikoni parashikimin e datave dhe klikoni “Krijo mësimin”: krijohen të gjitha si draft.",
        "Hapni serinë (“Hap serinë”) për t'i publikuar njëherësh, për të ndryshuar orën e të gjitha datave ose për t'i anuluar.",
      ],
      tips: [{ text: "Çdo datë mund të ndryshohet edhe veçmas, nga faqja e saj." }],
      link: { href: "/admin/mesimet/i-ri", label: "Mësim i ri" },
    },
    {
      id: "zhvendos",
      category: "lessons",
      title: "Zhvendosni ose anuloni një mësim",
      keywords: ["ndrysho orën", "shtyj", "anulo", "fshi", "arkivo", "ndryshim orari"],
      steps: [
        "Hapni mësimin → skeda “Detaje”, ndryshoni datën ose orën dhe klikoni “Ruaj ndryshimet”.",
        "Studentët e regjistruar marrin vetë një njoftim dhe një email për orarin e ri.",
        "Për ta anuluar: “Anulo mësimin”. Studentët njoftohen dhe nuk kanë më akses.",
        "“Fshi mësimin” e heq përgjithmonë, me regjistrimet; materialet mbeten te Materialet.",
      ],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },
    {
      id: "kalendari",
      category: "lessons",
      title: "Shikoni të gjithë muajin në kalendar",
      keywords: ["kalendar", "muaj", "javë", "orari", "pamje"],
      steps: [
        "Hapni Kalendari: çdo kurs ka ngjyrën e vet.",
        "Filtroni sipas kursit me butonat sipër.",
        "Klikoni një mësim për ta hapur, ndryshuar ose nisur.",
      ],
      link: { href: "/admin/kalendari", label: "Hap kalendarin" },
    },

    // --- Klasa live ------------------------------------------------------------------------
    {
      id: "nis-klasen",
      category: "live",
      title: "Nisni klasën live",
      keywords: ["zoom", "fillo", "nis", "live", "takim", "start", "hyr në klasë"],
      steps: [
        "Pak para orës, klasa shfaqet në krye të panelit me “Nis klasën” (ose hapni mësimin → “Klasa live në Zoom”).",
        "Klikoni “Nis klasën live”: takimi hapet brenda faqes, pa instaluar asgjë.",
        "Studentët njoftohen menjëherë dhe u shfaqet butoni “Bashkohu”.",
        "Në fund: në Zoom, End → End Meeting for All. Faqja e shënon mësimin si të përfunduar.",
      ],
      tips: [
        { text: "Mund ta nisni edhe në aplikacionin Zoom në kompjuter: “Nis në aplikacionin Zoom”. Lidhja vlen pak kohë.", untested: true },
        { text: "Nëse faqja e tregon ende si live pasi keni mbaruar, përdorni “Shëno si të përfunduar” te mësimi." },
      ],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },
    {
      id: "video-me-ze",
      category: "live",
      title: "Shfaqni një video me zë gjatë klasës",
      keywords: ["video", "zë", "ndaj ekranin", "share screen", "prezantim"],
      steps: [
        "Nisni klasën në aplikacionin Zoom në kompjuter.",
        "Share Screen → Advanced → Video dhe zgjidhni skedarin MP4.",
        "Kur ndani ekranin me lëvizje, shënoni “Optimize for video clip” që videoja të mos ngecë.",
      ],
      tips: [{ text: "Në shfletues, ndani një skedë ku luhet videoja dhe aktivizoni zërin e skedës (Chrome ose Edge).", untested: true }],
    },
    {
      id: "kontrollet",
      category: "live",
      title: "Kamera, mikrofoni, chat-i dhe dora e ngritur",
      keywords: ["kamera", "mikrofon", "chat", "dora", "hesht", "mute"],
      steps: [
        "Këto janë kontrollet e vetë Zoom-it, në shiritin e takimit.",
        "Studentët hyjnë me kamerë të fikur; secili e ndez vetë.",
        "Për të nxjerrë dikë: Participants → pranë emrit → Remove.",
      ],
      tips: [
        { text: "Skedarët e dërguar në chat-in e Zoom-it nuk ruhen në faqe: ngarkojini te Materialet e mësimit." },
        { text: "Chat-i dhe ngritja e dorës funksionojnë si në çdo takim Zoom.", untested: true },
      ],
    },
    {
      id: "pjesemarrja-klases",
      category: "live",
      title: "Kush erdhi në klasë",
      keywords: ["prezenca", "mungesa", "kush erdhi", "pjesëmarrje", "lista"],
      steps: [
        "Hapni mësimin → skeda “Pjesëmarrja”.",
        "Shihni kush ndoqi, sa minuta qëndroi dhe kush mungoi.",
        "Gjatë klasës, rifreskoni faqen për të parë të rejat.",
      ],
      tips: [{ text: "Studenti njihet kur hyn nga faqja ose me emrin e vet në Zoom. Emrat e tjerë dalin te “Të tjerë në klasë”." }],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },
    {
      id: "studenti-sheh",
      category: "live",
      title: "Çfarë shohin studentët",
      keywords: ["studenti", "portal", "telefon", "bashkohu", "si duket"],
      steps: [
        "Paneli i tyre tregon klasën live, mësimet e ardhshme dhe regjistrimet.",
        "Në faqen e mësimit kanë klasën, materialet, informacionin dhe regjistrimet.",
        "Klasa vazhdon në një dritare të vogël në cep kur shohin faqe të tjera.",
        "Pas mësimit mund të japin yje dhe koment.",
      ],
      tips: [
        { text: "Kur afati i një studenti skadon, nuk hyn dot më nga faqja; nëse është tashmë në takim, nuk nxirret vetë." },
        { text: "Nëse klasa nuk hapet në pajisjen e tyre, kanë “Hap në aplikacionin Zoom”.", untested: true },
      ],
    },

    // --- Studentët -------------------------------------------------------------------------
    {
      id: "student-i-ri",
      category: "students",
      title: "Shtoni një student",
      keywords: ["llogari", "regjistro", "student i ri", "fjalëkalim", "email"],
      steps: [
        "Hapni Studentët → “Student i ri”.",
        "Shkruani emrin dhe emailin; zgjidhni kursin dhe, nëse doni, telefonin dhe qytetin.",
        "Klikoni “Krijo dhe dërgo emailin”: studenti merr një lidhje për të vendosur fjalëkalimin (vlen 72 orë).",
      ],
      tips: [{ text: "Nëse emaili nuk mbërriti: te studenti → “Dërgo përsëri emailin e fjalëkalimit”." }],
      link: { href: "/admin/studentet?krijo=1", label: "Student i ri" },
    },
    {
      id: "excel",
      category: "students",
      title: "Shtoni shumë studentë nga Excel",
      keywords: ["excel", "import", "skedar", "listë", "xlsx", "shumë njëherësh"],
      steps: [
        "Hapni Studentët → “Student i ri” → “Importo nga Excel”.",
        "Shkarkoni shabllonin dhe plotësoni kolonat Emrat, Email dhe Abonimet (kursi).",
        "Ngarkoni skedarin: shihni paraprakisht çdo rresht dhe gabimet.",
        "Importoni: secili merr emailin për fjalëkalimin.",
      ],
      tips: [{ text: "Disa kurse për një student ndahen me presje." }],
      link: { href: "/admin/studentet?krijo=1", label: "Hap importin" },
    },
    {
      id: "ftesa",
      category: "students",
      title: "Ftoni klasën me një lidhje (p.sh. në WhatsApp)",
      keywords: ["ftesë", "lidhje", "link", "whatsapp", "grup", "bashkohu", "ndaj"],
      steps: [
        "Publikoni mësimin: lidhjet funksionojnë vetëm për mësime të publikuara.",
        "Hapni mësimin → skeda “Ftesat” → “Krijo lidhje ftese”.",
        "Nëse doni, vendosni kufirin e përdorimeve dhe deri kur vlen.",
        "Kopjojeni lidhjen menjëherë (shfaqet vetëm një herë) dhe dërgojeni në grup.",
        "Studenti hyn me llogarinë e vet dhe shtyp “Bashkohu”.",
      ],
      tips: [{ text: "“Anulo lidhjen” ndalon bashkimet e reja; kush është brenda e ruan aksesin." }],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },
    {
      id: "shto-ne-mesim",
      category: "students",
      title: "Shtoni ose hiqni një student nga mësimi",
      keywords: ["shto në mësim", "hiq aksesin", "akses", "regjistro në klasë", "jashtë kursit"],
      steps: [
        "Hapni mësimin → skeda “Studentët”.",
        "Studentët e kursit që mungojnë shfaqen sipër: zgjidhini dhe shtojini.",
        "Për dikë jashtë kursit, kërkojeni me emër ose email dhe klikoni “Shto”.",
        "“Hiq aksesin” e heq; “Rikthe aksesin” e kthen.",
      ],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },
    {
      id: "kurset-e-studentit",
      category: "students",
      title: "Ndryshoni kurset e një studenti",
      keywords: ["kurs", "transfero", "ndrysho kursin", "abonim"],
      steps: [
        "Hapni Studentët → menyja “…” pranë studentit → “Kurset”.",
        "Zgjidhni kurset që ndjek.",
        "Shënoni “Shtoje edhe në mësimet e ardhshme” që të hyjë menjëherë edhe në mësimet e planifikuara.",
      ],
      link: { href: "/admin/studentet", label: "Hap studentët" },
    },
    {
      id: "pjesemarrja-studentit",
      category: "students",
      title: "Sa klasa ka ndjekur një student",
      keywords: ["pjesëmarrja", "mungesa", "prezenca", "18 nga 24", "ndjek", "humbi"],
      steps: [
        "Hapni Studentët: kolona “Pjesëmarrja” tregon p.sh. 18 / 24.",
        "Klikoni emrin ose numrin: shihni çdo klasë, me të kuqe ato që humbi.",
      ],
      link: { href: "/admin/studentet", label: "Hap studentët" },
    },
    {
      id: "caktivizo",
      category: "students",
      title: "Çaktivizoni ose fshini një student",
      keywords: ["çaktivizo", "blloko", "fshi", "largo", "mbyll llogarinë"],
      steps: [
        "Hapni Studentët → menyja “…” pranë studentit.",
        "“Çaktivizo”: del nga të gjitha pajisjet dhe nuk hyn dot; mund ta riaktivizoni.",
        "“Fshi”: e heq përgjithmonë. Një student me pagesa nuk fshihet; çaktivizojeni.",
      ],
      link: { href: "/admin/studentet", label: "Hap studentët" },
    },

    // --- Pagesat ---------------------------------------------------------------------------
    {
      id: "pagesa",
      category: "payments",
      title: "Regjistroni një pagesë",
      keywords: ["pagesë", "para", "paguaj", "kesh", "bankë", "faturë", "arkëto"],
      steps: [
        "Hapni Pagesat dhe gjeni studentin (filtroni sipas kursit nëse duhet).",
        "Klikoni “Regjistro pagesë”.",
        "Shkruani sa muaj paguan; shuma plotësohet nga çmimi mujor (ndryshojeni nëse ka zbritje).",
        "Zgjidhni datën dhe mënyrën (para në dorë, bankë) dhe klikoni “Regjistro”.",
      ],
      tips: [
        { text: "Një pagesë e gabuar nuk fshihet: te “Historiku i pagesave” → “Anulo”, me arsyen." },
        { text: "Pagesat bëhen jashtë faqes; portali nuk merr pagesa online." },
      ],
      link: { href: "/admin/pagesat", label: "Hap pagesat" },
    },
    {
      id: "me-vonese",
      category: "payments",
      title: "Kush është me vonesë me pagesën",
      keywords: ["borxh", "vonesë", "detyrim", "nuk ka paguar", "afati"],
      steps: [
        "Hapni Pagesat dhe zgjidhni “Me vonesë” te Gjendja.",
        "Sipër shihni borxhin gjithsej; për çdo student, sa i mbetet dhe afatin.",
        "Paneli kryesor ju kujton vetë kur ka studentë me vonesë.",
      ],
      link: { href: "/admin/pagesat?gjendja=OVERDUE", label: "Shiko me vonesë" },
    },
    {
      id: "muaji-fillimit",
      category: "payments",
      title: "Student që filloi kursin më vonë",
      keywords: ["muaji", "filloi vonë", "hyri më vonë", "borxh i gabuar"],
      steps: [
        "Hapni Pagesat → menyja pranë studentit → “Muaji i fillimit”.",
        "Zgjidhni muajin e kursit nga i cili paguan: muajt para tij nuk llogariten si borxh.",
      ],
      link: { href: "/admin/pagesat", label: "Hap pagesat" },
    },

    // --- Materialet dhe regjistrimet -----------------------------------------------------------------
    {
      id: "materialet",
      category: "files",
      title: "Ngarkoni materiale (PDF, foto, video)",
      keywords: ["material", "pdf", "skedar", "dokument", "powerpoint", "word", "ngarko"],
      steps: [
        "Hapni mësimin → skeda “Materialet” → “Ngarko materiale” (ose tërhiqni skedarët aty).",
        "Prisni “Gati”: studentët shohin vetëm materialet e verifikuara.",
        "Renditini me shigjetat dhe riemërtojini që të jenë të qarta.",
      ],
      tips: [{ text: "PDF, PowerPoint, Word deri në 100 MB, foto deri në 50 MB, video MP4 deri në 4 GB." }],
      link: { href: "/admin/materialet", label: "Hap materialet" },
    },
    {
      id: "riperdor",
      category: "files",
      title: "Përdorni të njëjtin material në një mësim tjetër",
      keywords: ["ripërdor", "kopjo", "i njëjti skedar", "biblioteka"],
      steps: [
        "Hapni mësimin e ri → skeda “Materialet” → “Nga materialet”.",
        "Zgjidhni materialet dhe klikoni “Shto”: nuk ngarkohen përsëri.",
      ],
      link: { href: "/admin/materialet", label: "Hap materialet" },
    },
    {
      id: "regjistrimet",
      category: "files",
      title: "Regjistrimet e klasave",
      keywords: ["regjistrim", "video e klasës", "rishiko", "recording", "zoom cloud"],
      steps: [
        "Regjistrimi i Zoom-it shfaqet vetë te mësimi → “Regjistrimet”, pak minuta pas klasës.",
        "Studentët njoftohen kur është gati dhe e shohin deri në afatin e tyre.",
        "Mund të ngarkoni edhe një video MP4 me dorë: “Ngarko regjistrim (MP4)”.",
      ],
      tips: [{ text: "Një ditë pas afatit të aksesit të mësimit, regjistrimet fshihen vetë. Zgjateni afatin para kësaj nëse duhen më gjatë." }],
      link: { href: "/admin/mesimet", label: "Hap mësimet" },
    },

    // --- Faqja e internetit --------------------------------------------------------------------
    {
      id: "galeria",
      category: "website",
      title: "Shtoni foto në galeri",
      keywords: ["foto", "galeri", "imazh", "punime", "faqja kryesore"],
      steps: [
        "Hapni Përmbajtja → Galeria → “Ngarko foto”.",
        "Shkruani një përshkrim të shkurtër të fotos.",
        "Zgjidhni ku shfaqet: në galeri, në krye të faqes kryesore, te Rreth nesh.",
      ],
      link: { href: "/admin/permbajtja/galeria", label: "Hap galerinë" },
    },
    {
      id: "sherbimet",
      category: "website",
      title: "Shërbimet e sallonit dhe çmimet",
      keywords: ["shërbim", "çmim", "sallon", "lista e çmimeve"],
      steps: ["Hapni Përmbajtja → Shërbimet.", "Shtoni çdo shërbim me çmimin (opsional) dhe renditini.", "Ndryshimet shfaqen menjëherë te faqja “Shërbimet”."],
      link: { href: "/admin/permbajtja/sherbimet", label: "Hap shërbimet" },
    },

    // --- Statistikat dhe vlerësimet ----------------------------------------------------------------
    {
      id: "statistikat",
      category: "insight",
      title: "Si po shkon akademia (statistikat)",
      keywords: ["statistika", "të ardhura", "fitim", "arkëtime", "raport", "grafik"],
      steps: [
        "Hapni Statistikat.",
        "Sipër: sa keni arkëtuar këtë muaj, borxhi, pjesëmarrja dhe vlerësimi mesatar.",
        "Grafiku tregon arkëtimet e 12 muajve të fundit.",
        "“Studentë që mungojnë”: kush ka humbur klasat e fundit radhazi. Një telefonatë mund t'i mbajë.",
      ],
      link: { href: "/admin/statistikat", label: "Hap statistikat" },
    },
    {
      id: "vleresimet",
      category: "insight",
      title: "Çfarë thonë studentët (vlerësimet)",
      keywords: ["vlerësim", "yje", "koment", "mendim", "feedback"],
      steps: [
        "Hapni Vlerësimet.",
        "“Kurset e përfunduara”: vlerësimi i çdo kursi dhe i mësimeve të tij.",
        "“Mësime të tjera” dhe “Portali”: komentet e tjera.",
      ],
      link: { href: "/admin/vleresimet", label: "Hap vlerësimet" },
    },
    {
      id: "historiku",
      category: "insight",
      title: "Kush ndryshoi çfarë (historiku)",
      keywords: ["historik", "ndryshim", "kush", "log", "veprime"],
      steps: ["Hapni Historiku: veprimet e rëndësishme, nga më e reja."],
      link: { href: "/admin/historiku", label: "Hap historikun" },
    },
  ] satisfies HelpGuide[],
} as const;
