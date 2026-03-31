# Example: Blog Application Schema

## Additional Sample

- `full-relationships-10-classes.orm.json`: 10 class entity diagram that includes all UML relation types (`association`, `aggregation`, `composition`, `inheritance`, `realization`, `dependency`) and ORM relation types (`OneToOne`, `OneToMany`, `ManyToMany`) for broader testing.
- `simple-5-classes.orm.json`: beginner-friendly 5 class diagram for quick testing (`User`, `Post`, `Comment`, `Category`, `Tag`) with common relations.

This is an example UML to ORM diagram showing a simple blog application structure.

## Schema Overview

The diagram contains two entities:

### User

- **id** (String, Primary Key)
- **email** (String, Unique)
- **name** (String)
- **createdAt** (DateTime, Default: now())

### Post

- **id** (String, Primary Key)
- **title** (String)
- **content** (String, Nullable)
- **published** (Boolean, Default: false)

### Relationships

- User has many Posts (OneToMany)
- When a User is deleted, their Posts are cascade deleted

## How to Use

1. Open this file with the UML to ORM Diagram Editor
2. Edit entities and relationships in the visual editor
3. Generate code for your preferred ORM:
   - Prisma Schema
   - TypeORM Entities
   - SQLAlchemy Models
   - Hibernate JPA Entities

## Generated Code Examples

You can generate code by running the `UML to ORM: Generate Code` command.

### Prisma (TypeScript)

```prisma
model User {
  id    String  @id @unique
  email String  @unique
  name  String
  posts Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        String  @id @unique
  title     String
  content   String?
  published Boolean @default(false)
  author    User    @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  String
}
```

### TypeORM (TypeScript)

```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: false, unique: true })
  email!: string;

  @Column({ nullable: false })
  name!: string;

  @OneToMany(() => Post, post => post.author)
  posts!: Post[];

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity()
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: false })
  title!: string;

  @Column({ nullable: true })
  content!: string | null;

  @Column({ nullable: false, default: false })
  published!: boolean;

  @ManyToOne(() => User, user => user.posts, { onDelete: 'CASCADE' })
  author!: User;

  @Column()
  authorId!: string;
}
```

### SQLAlchemy (Python)

```python
class User(Base):
    __tablename__ = 'user'

    id = Column(String, primary_key=True, unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    posts = relationship("Post", back_populates="author", cascade="all, delete-orphan")

class Post(Base):
    __tablename__ = 'post'

    id = Column(String, primary_key=True, unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(String(255), nullable=True)
    published = Column(Boolean, nullable=False, default=False)
    author_id = Column(String, ForeignKey('user.id', ondelete='CASCADE'), nullable=False)

    author = relationship("User", back_populates="posts")
```

### Hibernate (Java)

```java
@Entity
@Table(name = "user")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String name;

    @OneToMany(mappedBy = "author", cascade = CascadeType.ALL)
    private List<Post> posts;

    @CreationTimestamp
    private LocalDateTime createdAt;

    // Getters and Setters...
}

@Entity
@Table(name = "post")
public class Post {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = true)
    private String content;

    @Column(nullable = false)
    private Boolean published = false;

    @ManyToOne
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    // Getters and Setters...
}
```
