/*
Copyright (c) 2025 Joseph Parker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

***
Unfortunately I overwrote this file that had the reactive stuff, but it was a very interesting puzzle trying
to figure out how to get Reagent style reactivity in js.

When RenderDOM encounters a function, it:

* sets an UID
* calls the function (component) to get the returned vdom data
* if any store values are accessed during that render:
  * subscribe a function that re-renders the component and replaces the original Element
  * annotate the final DOM Element with the UID so it can be retreived either by querySelector or a lookup map

Some questions:

  with getters and setters how can we work with object state?
  - probably just need to use a state.set() fn

  How can we avoid duplicate re-renders of children?

  How can we 'GC' subscribers when their elements are no longer mounted?
  - they could querySelector their dom and if it's null then unsubscribe
  - a comp could gather all descendants and on a re-render clear them
  - diffing with element patching could reuse some but that's not a full solution

  How can we clean up subscriptions for child fn components that are no longer mounted?

  How can we avoid duplicate subscriptions (like if we accesss a value multiple times)
   - perhaps a RaF to dedup, which could also avoid situations where multiple stores have the same subscriber

  How do we subscribe the current component, when it may render arbitrary sub components during execution?
   - we want to subscribe a payload of {uid: [comp-fn, Element]}, we can set (most of) these as global variables that state can pull from,
     but if children are being rendered then those global variables have to become a stack of some sort


  Caching subcomponents.

  A comp fn could cache a list of child [comp, dom] tuples. On a re-render it could use matching comps.

  I haven't been taking comp arguments into account so far, this should probably follow reagent with
  `[f, arg1, arg2]` in the dom representing a function call with args.  RenderDOM would have to check
  for an array with function as first element, but after that the subscriber mechanic would be unchanged.

  If I did cache subcomponents then I'd have to check equality on the arg list as well.

  When the re-render occurs I'd then want to avoid calling child components if their equality matched, so
  some sort of index of child component is in order, as well as a state of re-rendering where the cache is accessible.

  May not hurt to formalize the way I talk about that as somthing like a 'Context'


  DOM patching

  Wholecloth replacing of DOM is not the best for stateful elements like inputs. I've heard that some
  vdom libs patch existing elements to bring them align with the new content.  Perhaps I could even
  patch existing DOM directly from the vector representation?

     */

function state(x) {
  let value = x;
  let subscribers = {};
  return {
    get value() {
      // check if we accessed this state while rendering a component and if so subscribe it
      let id_comp = current_id();
      if (id_comp) {
        subscribers[id_comp[0]] = id_comp[1];
      }
      return value;
    },
    set(x) {
      value = x;
      for (const [id, node] of Object.entries(subscribers)) {
        console.log(id, node);
        el = document.querySelector(`[data-uid="${id}"`);
        if (el) {
          dom = RenderDOM(node());
          dom.setAttribute("data-uid", id);
          el.replaceWith(dom);
        } else {
          console.log("freeing susbscription", id);
          delete subscribers[id];
        }
      }
    },
  };
}

var _id = 0;
function uid() {
  return _id++;
}

var _id_stack = [];
function current_id() {
  return _id_stack[_id_stack.length - 1];
}

// construct a dom fragment from nested data of ['tag', optional {attrs}, ... children]
function RenderDOM(node) {
  if (!node) {
    return;
  } else if (typeof node == "function") {
    let id = uid();
    _id_stack.push([id, node]);
    let dom = RenderDOM(node());
    dom.setAttribute("data-uid", id);
    _id_stack.pop();
    return dom;
  } else if (Array.isArray(node)) {
    // the node string might contain an id or classes, like "button#main.red.disabled"
    // here we parse those out
    let tag = node[0].match(/^[^\.#]+/)[0];
    let classes = node[0].match(/\.[^\.#]+/g) || [];
    let ids = node[0].match(/\#[^\.#]+/g) || [];
    // second item might be an attribute map, everything else are children of this node
    let attrs =
      Object.prototype.toString.call(node[1]) === "[object Object]"
        ? node[1]
        : null;
    let children = node.slice(attrs ? 2 : 1);
    let el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        // function literals can't be set as an attribute
        if (typeof v === "function") {
          el[k] = v;
        } else {
          el.setAttribute(k, v);
        }
      }
    }
    classes.forEach((s) => el.classList.add(s.slice(1)));
    if (ids[0]) {
      el.setAttribute("id", ids[0].slice(1));
    }
    children.forEach((child) => {
      // recur for each child
      let cnode = RenderDOM(child);
      if (cnode) {
        el.appendChild(cnode);
      }
    });
    return el;
  } else {
    return document.createTextNode(node);
  }
}

let counter = state(0);
let stuff = state({ title: "hello world" });

let myApp = () => {
  return ["div", ["h1", stuff.value.title, ` ${counter.value}`], myComp];
};

let myComp = () => {
  return [
    "div",
    ["p", `current count: ${counter.value}`],
    [
      "button",
      { onclick: (e) => counter.set((counter.value += 1)) },
      "increment",
    ],
    [
      "button",
      { onclick: (e) => stuff.set({ title: "goodbye crabs" }) },
      "change title",
    ],
  ];
};

document.body.appendChild(RenderDOM(myApp));
