"use client";

import { Button } from "@radix-ui/themes";
import { CategoryNode } from "@/lib/deals";

function CategoryOption({
  node,
  selectedCategory,
  onSelect,
}: {
  node: CategoryNode;
  selectedCategory: string;
  onSelect: (path: string) => void;
}) {
  const isActive = selectedCategory === node.path;

  const button = (
    <Button
      type="button"
      variant={isActive ? "solid" : "ghost"}
      color={isActive ? "ruby" : "gray"}
      size="2"
      className="category-option"
      data-category={node.path}
      onClick={(event) => {
        event.preventDefault();
        onSelect(node.path);
      }}
    >
      {node.name}
    </Button>
  );

  if (node.children.length === 0) {
    return button;
  }

  // Selecting a parent node's own label (its <summary> button) shouldn't
  // also toggle this <details> open/closed via the native summary click --
  // the button's own onClick already calls preventDefault(). Open/closed is
  // fully derived from selectedCategory below, not user-toggled.
  const isOpen = selectedCategory === node.path || selectedCategory.startsWith(`${node.path}|`);

  return (
    <details className="category-subtree" open={isOpen}>
      <summary>{button}</summary>
      {node.children.map((child) => (
        <CategoryOption key={child.path} node={child} selectedCategory={selectedCategory} onSelect={onSelect} />
      ))}
    </details>
  );
}

export function CategoryTree({
  tree,
  selectedCategory,
  onSelect,
}: {
  tree: CategoryNode[];
  selectedCategory: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div id="category-tree" className="category-tree">
      <Button
        type="button"
        variant={selectedCategory === "" ? "solid" : "ghost"}
        color={selectedCategory === "" ? "ruby" : "gray"}
        size="2"
        className="category-option"
        data-category=""
        onClick={(event) => {
          event.preventDefault();
          onSelect("");
        }}
      >
        All categories
      </Button>
      {tree.map((node) => (
        <CategoryOption key={node.path} node={node} selectedCategory={selectedCategory} onSelect={onSelect} />
      ))}
    </div>
  );
}
