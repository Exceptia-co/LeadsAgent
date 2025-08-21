#!/bin/bash

echo "🔍 Identificando archivos problemáticos..."

# Reset git
git reset HEAD >/dev/null 2>&1

# Array para almacenar archivos problemáticos
problematic_files=()

# Find all files in apps/api (excluding node_modules)
find apps/api -type f ! -path "*/node_modules/*" | while read file; do
  if ! git add "$file" >/dev/null 2>&1; then
    echo "❌ Problemático: $file"
    
    # Backup content if any
    if [ -s "$file" ]; then
      echo "  📋 Backing up content..."
      cp "$file" "${file}.backup"
    fi
    
    # Get file extension
    ext="${file##*.}"
    
    # Recreate based on file type
    case "$ext" in
      "ts")
        echo "  🔧 Recreando archivo TypeScript..."
        rm "$file"
        touch "$file"
        echo "// TODO: Recrear contenido de $file" > "$file"
        ;;
      "json")
        echo "  🔧 Recreando archivo JSON..."
        rm "$file"
        echo "{}" > "$file"
        ;;
      *)
        echo "  🔧 Recreando archivo genérico..."
        rm "$file"
        touch "$file"
        ;;
    esac
    
    # Try to add again
    if git add "$file" >/dev/null 2>&1; then
      echo "  ✅ Archivo reparado"
      git reset HEAD "$file" >/dev/null 2>&1
    else
      echo "  ⚠️  Aún problemático"
    fi
  else
    git reset HEAD "$file" >/dev/null 2>&1
  fi
done

echo "✅ Proceso completado"
