function icon(name){
  const icons = {
    learner:`<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="2"/>
      <path d="M4 22a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    cert:`<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    settings:`<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.5a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .3 1.7 1.7 0 0 0-.87 1.47V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.1 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 3.34 17l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-1.47-.87H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.1a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.03 3.34l.06.06A1.7 1.7 0 0 0 8.1 4.6a1.7 1.7 0 0 0 1-.3 1.7 1.7 0 0 0 .87-1.47V2a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.9 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 20.66 6l-.06.06A1.7 1.7 0 0 0 19.4 8.1a1.7 1.7 0 0 0 .3 1 1.7 1.7 0 0 0 1.47.87H22a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  };
  return icons[name] || icons.learner;
}

function LearnerApp(){
  return {
    sidebarOpen:true,
    route:"my_courses",
    tab:"inprogress",
    q:"",
    nav:[
      { key:"my_courses", route:"my_courses", label:"Mes cours", icon: icon("learner") },
      { key:"certificates", route:"certificates", label:"Certificats", icon: icon("cert") },
      { key:"settings", route:"settings", label:"Paramètres", icon: icon("settings") },
    ],
    courses:[],
    certificates:[],
    init(){
      this.courses = [
        { id:1, title:"Budget & Épargne intelligente", module:"3/8", minutes:34, progress:62, done:false, score:null },
        { id:2, title:"Excel pour la Finance", module:"5/10", minutes:58, progress:44, done:false, score:null },
        { id:3, title:"Bases de la Comptabilité", module:"10/10", minutes:0, progress:100, done:true, score:86 },
      ];
      this.certificates = [
        { serial:"BE-9A31F2D8C1", course:"Bases de la Comptabilité" },
        { serial:"BE-18C0B9F0AA", course:"Procédures RH & conformité" },
      ];
      const mq = window.matchMedia("(max-width: 1024px)");
      this.sidebarOpen = !mq.matches;
      mq.addEventListener?.("change", (e)=>{ this.sidebarOpen = !e.matches; });
    },
    goto(r){ this.route=r; if (window.innerWidth<1024) this.sidebarOpen=false; },
    pageTitle(){
      return { my_courses:"Mes cours", certificates:"Mes certificats", settings:"Paramètres" }[this.route] || "Mes cours";
    }
  }
}
