# 🚀 Хэрэглэх заавар | Usage Guide

## Extension-г эхлүүлэх

### 1️⃣ Editor нээх

**Аргa 1: Command Palette**

```
1. Ctrl+Shift+P дарна
2. "UML to ORM: Open Editor" гэж хайна
3. Enter дарна
```

**Арга 2: Файл үүсгэх**

```
1. Workspace дээр шинэ файл үүсгэнэ: myproject.orm.json
2. Файлыг нээхэд автоматаар diagram editor асна
```

---

## 🎨 Diagram үүсгэх

### Алхам 1: Entity нэмэх

- **"Add Entity"** товч дарна (дээд баруун талд)
- Шинэ entity canvas дээр гарч ирнэ
- Entity дээр дарж сонгоно

### Алхам 2: Attributes нэмэх

- Entity сонгосон үед баруун талд **Property Panel** гарч ирнэ
- **"Add Attribute"** товч дарна
- Attribute-ийн мэдээллийг оруулна:
  - `name`: attribute-ийн нэр (жишээ: `email`, `age`)
  - `type`: өгөгдлийн төрөл (String, Int, Boolean, DateTime гэх мэт)
  - `isPrimary`: Primary key эсэх
  - `isNullable`: NULL утга авч болох эсэх
  - `isUnique`: Unique constraint эсэх

### Алхам 3: Relationships холбох

- Entity-ийн доод булан дээр байгаа **цэг (handle)** татаж, өөр entity руу холбоно
- Автоматаар **OneToMany** relationship үүснэ
- Жишээ: User → Post (One user has many posts)

### Алхам 4: Хадгалах

- **"Save"** товч дарна
- Schema `.orm.json` файл болж хадгалагдана

---

## 💻 Code Generation

### Алхам 1: Generate хийх

```
1. Ctrl+Shift+P дарна
2. "UML to ORM: Generate Code" сонгоно
3. ORM сонгоно (Prisma, TypeORM, SQLAlchemy, Hibernate, Django)
```

### Алхам 2: Generated код үзэх

- Шинэ editor tab нээгдэнэ
- Таны diagram-аас үүссэн бэлэн код харагдана
- Код-ыг хуулж, төслөө хаана ч ашиглаж болно

---

## 🔄 Reverse Engineering (Existing code → Diagram)

```
1. Ctrl+Shift+P дарна
2. "UML to ORM: Import Schema from Code" сонгоно
3. Өөрийн schema файлаа сонгоно:
   - Prisma: schema.prisma
   - TypeORM: entity files (.ts)
   - SQLAlchemy: model files (.py)
   - Hibernate: entity classes (.java)
4. Автоматаар diagram үүснэ
```

---

## ⌨️ Keyboard Shortcuts

| Үйлдэл          | Товчлуур               |
| --------------- | ---------------------- |
| Command Palette | `Ctrl+Shift+P`         |
| Save            | `Ctrl+S`               |
| Zoom In         | `+` / Mouse wheel up   |
| Zoom Out        | `-` / Mouse wheel down |
| Fit View        | `F`                    |

---

## 🎯 Жишээ Workflow

### Blog System үүсгэх:

1. **"Add Entity"** → `User` нэр өгнө
2. User entity дээр дарна
3. Attributes нэмнэ:
   - `id` (Int, Primary)
   - `email` (String, Unique)
   - `name` (String)
   - `createdAt` (DateTime)

4. **"Add Entity"** → `Post` нэр өгнө
5. Post attributes:
   - `id` (Int, Primary)
   - `title` (String)
   - `content` (String)
   - `authorId` (Int)
   - `publishedAt` (DateTime)

6. **Relationship холбох:**
   - User доод цэгээс → Post руу татна
   - OneToMany relationship үүснэ

7. **"Save"** дарна

8. **Generate Code:**
   - `Ctrl+Shift+P` → "Generate Code"
   - Prisma сонгоно
   - `schema.prisma` файл үүснэ!

---

## 💡 Зөвлөмж

✅ **Entity нэрийг CamelCase-ээр бичнэ** (User, BlogPost, OrderItem)
✅ **Primary key заавал байх ёстой** (id attribute-тэй)
✅ **Relationship холбохдоо entity-г дарж татана**
✅ **Өөрчлөлт бүрийг Save хийнэ** (`Ctrl+S`)

❌ **Нэр давхардуулахгүй** (2 ижил нэртэй entity үүсгэхгүй)
❌ **Attribute утгуудыг хоосон үлдээхгүй**

---

## 🐛 Асуудал гарвал

### 1. **"Add Entity" товч дарахад юу ч болохгүй байна:**

**Шалгах:**

- VS Code-ын Developer Tools нээнэ: `Help` → `Toggle Developer Tools`
- `Console` tab дээр шалгана:
  - `🎯 Add Entity clicked!` гэсэн log харагдах ёстой
  - `📦 Creating new entity:` гэж entity мэдээлэл харагдана
  - `✅ Entity added to state and nodes` гэх ёстой
  - Алдаа байвал улаан текстээр харагдана

**Засах:**

```bash
# Terminal дээр:
cd /home/munkh-orgil/Documents/thesis
npm run build:webview
# Дараа нь VS Code-г reload хийнэ (F5 дарж дахин ажиллуулна)
```

### 2. **Webview харагдахгүй байна:**

- `npm run build:webview` ажиллуулаад дахин F5 дарна

2. **Compile error гарч байна:**
   - `npm run compile` ажиллуулна
   - Errors харагдвал code засна

3. **Extension activate хийгдэхгүй:**
   - Debug Console дахь error logs-г шалгана
   - Extension-г restart хийнэ (`Reload Window`)

---

## 📹 Харагдац Preview

```
┌─────────────────────────────────────────┐
│  📦 Prisma  🔤 TypeScript  [Add Entity] │ ← Toolbar
├────────────────┬────────────────────────┤
│                │                        │
│   ┌──────┐    │   Property Panel       │
│   │ User │────┤                        │
│   └──────┘    │   Entity Name: User    │
│       │       │                        │
│       ▼       │   Attributes:          │
│   ┌──────┐    │   • id: Int (PK)      │
│   │ Post │    │   • email: String      │
│   └──────┘    │   • name: String       │
│                │   [Add Attribute]      │
│   Canvas       │   [Save] [Delete]      │
└────────────────┴────────────────────────┘
```

---

**Амжилт хүсье! 🎉**
