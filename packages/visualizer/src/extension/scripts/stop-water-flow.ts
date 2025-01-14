const styleElements = document.querySelectorAll('[id="water-flow-animation"]');
styleElements.forEach((element) => {
  document.head.removeChild(element);
});
