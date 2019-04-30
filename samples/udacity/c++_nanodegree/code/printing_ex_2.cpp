#include <iostream>
#include <vector>
using std::vector;
using std::cout;

int main() {
    vector<int> a = {0, 1, 2, 3, 4};
    // Add some code here to access and print elements of a.
    for(int i : a)
        cout << i;
    cout << "\n";
}
