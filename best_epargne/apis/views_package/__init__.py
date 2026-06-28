"""best_epargne/apis/views — Package successor de ``apis/views.py`` (V6.C).

CORRECTIF audit (FORMATIONS-46, AUDIT_REPORT §5.2) : le module
``best_epargne/apis/views.py`` faisait 3 238 lignes (god-module) — refactor
trop risqué à faire en une passe.

Stratégie de migration sûre :

1. Cette nouvelle structure ``views_package/`` est prête à recevoir les
   classes par sous-domaine :

   - ``views_package/public.py``      (PublicCourseDetailView, BusinessLandingView...)
   - ``views_package/instructor.py``  (InstructorCourse*, InstructorMedia*, ...)
   - ``views_package/learner.py``     (LearnerCourse*, LearnerEnroll*, ...)
   - ``views_package/media.py``       (MediaUpload*, MediaSignedGetView, ...)
   - ``views_package/platform.py``    (Platform*, AdminDashboard, ...)
   - ``views_package/_shared.py``     (_course_owned, _get_writable_course, ...)

2. Quand vous êtes prêt à migrer :
   - renommez ``best_epargne/apis/views.py`` en ``best_epargne/apis/_legacy_views.py``,
   - renommez ``views_package/`` en ``views/``,
   - dans le nouveau ``views/__init__.py``, faites :

         from ._legacy_views import *  # noqa: F401, F403

     puis déplacez progressivement les classes du _legacy vers les
     sous-modules de ``views/`` en gardant le re-export dans
     ``views/__init__.py``.

3. Aucun caller externe (api_urls.py, templates, autres apps) ne se
   casse car ils continuent d'importer depuis ``best_epargne.apis.views``.

L'API du module reste donc 100 % rétro-compatible pendant la migration.
"""
from __future__ import annotations

# Pendant la phase de transition, ce package re-exporte le contenu du
# god-module historique. Au fur et à mesure que les classes sont déplacées
# vers public.py / instructor.py / learner.py / media.py / platform.py,
# les imports descendants ne changent pas.
#
# Une fois la migration terminée, ce fichier deviendra un index propre :
#   from .public import *
#   from .instructor import *
#   ...

# Re-export du legacy (commenté tant que views.py existe — décommenter
# au moment du renommage views.py → _legacy_views.py).
# from ._legacy_views import *
