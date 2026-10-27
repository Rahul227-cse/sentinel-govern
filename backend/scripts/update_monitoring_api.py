import os
import shutil

source_path = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'monitoring', 'monitoring_api.py')
target_path = 'D:/sentinel-monitoring/monitoring_api.py'

if os.path.exists(source_path):
    shutil.copyfile(source_path, target_path)
    print(f'Successfully synchronized {source_path} to {target_path}')
else:
    print(f'Source file {source_path} not found.')
