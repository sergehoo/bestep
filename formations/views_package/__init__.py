"""formations/views — Package successor de ``formations/views.py`` (V6.C).

CORRECTIF audit FORMATIONS-46 / FORMATIONS-48 : ``views.py`` (2 039 lignes)
est un god-module qui mélange vues template instructor/learner/landing/admin
plateforme. À splitter en :

- ``views/instructor.py`` (InstructorDashboard, InstructorCourse*, ...)
- ``views/learner.py``    (LearnerDashboard, LearnerCourseDetail/Player, ...)
- ``views/platform.py``   (PlatformAdminDashboard, PlatformUsers/Organizations)
- ``views/landing.py``    (HomeView, BusinessLandingView, CategoryProfessional...)
- ``views/_shared.py``    (_humanize_date, _month_bounds, _redirect_by_role...)

Migration sûre : même approche que ``best_epargne/apis/views_package/``.
"""
from __future__ import annotations
