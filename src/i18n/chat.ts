/** Chat texts: chat list, windows and full-screen chats (portal and admin). */
export const chatText = {
  open: (unread: number) => (unread > 0 ? `Mesazhet (${unread} të palexuara)` : "Mesazhet"),
  title: "Mesazhet",
  description: "Bisedat tuaja me studentët dhe akademinë.",
  newChat: "Bisedë e re",
  back: "Kthehu",
  empty: "Nuk keni ende biseda.",
  emptyHint: "Shtypni ✎ për të nisur një bisedë.",
  loadError: "Bisedat nuk u ngarkuan. Provoni përsëri.",
  retry: "Provo përsëri",

  you: "Ju",
  deletedMessage: "Mesazhi u fshi",
  noMessagesYet: "Shkruani mesazhin e parë.",
  pinned: "E fiksuar",
  unread: (count: number) => `${count} të palexuara`,
  seen: "Parë",
  loadOlder: "Mesazhet e mëparshme",

  actions: "Veprime",
  pin: "Fikso",
  unpin: "Hiqe fiksimin",
  delete: "Fshi bisedën",
  deleteTitle: "Të fshihet biseda?",
  deleteBody: "Biseda dhe mesazhet e saj hiqen vetëm për ju. Personi tjetër i ruan. Nëse ju shkruan përsëri, biseda rishfaqet me mesazhet e reja.",
  deleteConfirm: "Fshi",
  cancel: "Anulo",
  deleted: "Biseda u fshi.",

  searchLabel: "Kërkoni një person",
  searchPlaceholder: "Shkruani emrin…",
  noPeople: "Nuk u gjet asnjë person.",
  roles: { admin: "Administrator", student: "Student" } as Record<string, string>,

  composerLabel: "Mesazhi",
  composerPlaceholder: "Shkruani një mesazh…",
  send: "Dërgo",
  charsLeft: (left: number) => `${left} karaktere të mbetura`,

  attachPhoto: "Shto foto",
  attachFile: "Shto skedar",
  removeAttachment: (name: string) => `Hiq ${name}`,
  uploading: "Duke ngarkuar…",
  uploadFailed: (name: string) => `${name} nuk u ngarkua. Provoni përsëri.`,
  tooMany: (max: number) => `Mund të dërgoni deri në ${max} foto ose skedarë në një mesazh.`,
  fileType: "Ky lloj skedari nuk lejohet. Lejohen foto (JPG, PNG, WebP), PDF, Word dhe PowerPoint.",
  fileTooBig: (name: string, limit: string) => `${name} është shumë i madh (maksimumi ${limit}).`,
  dropHere: "Lëshojini këtu për t'i dërguar",
  photo: "Foto",
  openPhoto: "Hap foton",
  openFile: (name: string) => `Hap ${name}`,
  photoOf: (n: number, total: number) => `Foto ${n} nga ${total}`,
  previous: "E mëparshmja",
  next: "Tjetra",
  download: "Shkarko",
  morePhotos: (n: number) => `+${n}`,
  /** Chat list and notices, for a message without text. */
  preview: (body: string | null, photos: number, files: number) => {
    if (body) return body;
    if (photos && !files) return photos === 1 ? "📷 Foto" : `📷 ${photos} foto`;
    if (files && !photos) return files === 1 ? "📎 Skedar" : `📎 ${files} skedarë`;
    return `📎 ${photos + files} skedarë`;
  },

  block: "Blloko",
  unblock: "Zhblloko",
  blockedToast: (name: string) => `${name} u bllokua.`,
  unblockedToast: (name: string) => `${name} u zhbllokua.`,
  cantSend: "Nuk mund të dërgoni më mesazhe në këtë bisedë.",
  youBlocked: "Ju e keni bllokuar këtë person.",

  newMessageFrom: (name: string) => `Mesazh i ri nga ${name}`,
  newMessage: "Mesazh i ri",
  minimize: "Minimizo",
  close: "Mbyll",
  openChat: "Hap",
};
