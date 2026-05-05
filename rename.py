import os
import re
import subprocess

def git_mv(old_path, new_path):
    try:
        # Check if file is tracked by git
        subprocess.check_call(['git', 'ls-files', '--error-unmatch', old_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call(['git', 'mv', old_path, new_path])
        print(f"git mv {old_path} {new_path}")
    except subprocess.CalledProcessError:
        os.rename(old_path, new_path)
        print(f"mv {old_path} {new_path}")

def process_contents():
    for root, dirs, files in os.walk("."):
        if any(x in root for x in [".git", "node_modules", "dist", "build", ".next", ".pnpm"]):
            continue
        for file in files:
            if file.startswith("."): 
                continue
            path = os.path.join(root, file)
            # Skip binary files or unreadable files
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original = content
                
                # Chinese translation replacement
                if re.search(r'[\u4e00-\u9fff]', content):
                    content = re.sub(r'\bKivo\b', '灵巢', content)
                    content = re.sub(r'\bKIVO\b', '灵巢', content)

                # General replacements
                content = content.replace('kivo', 'kivo')
                content = content.replace('灵巢', 'Kivo')
                content = content.replace('灵巢', 'KIVO')
                
                if content != original:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Updated content in {path}")
            except Exception as e:
                pass

def process_paths():
    for root, dirs, files in os.walk(".", topdown=False):
        if any(x in root for x in [".git", "node_modules", "dist", "build", ".next", ".pnpm"]):
            continue
        
        # Rename files
        for file in files:
            if "kivo" in file.lower():
                new_file = file.replace('kivo', 'kivo').replace('灵巢', 'Kivo').replace('灵巢', 'KIVO')
                old_path = os.path.join(root, file)
                new_path = os.path.join(root, new_file)
                git_mv(old_path, new_path)

        # Rename directories
        for d in dirs:
            if "kivo" in d.lower():
                new_d = d.replace('kivo', 'kivo').replace('灵巢', 'Kivo').replace('灵巢', 'KIVO')
                old_path = os.path.join(root, d)
                new_path = os.path.join(root, new_d)
                git_mv(old_path, new_path)

if __name__ == "__main__":
    print("Starting content replacement...")
    process_contents()
    print("Starting path renaming...")
    process_paths()
    print("Done.")
