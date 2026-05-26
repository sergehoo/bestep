import os
from dotenv import load_dotenv

load_dotenv()

env = os.environ.get('DJANGO_ENV')

if env == 'prod':
    print(">>> USING PROD SETTINGS")
    from .prod import *
else:
    print(">>> USING DEV SETTINGS")
    from .dev import *
